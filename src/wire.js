require('dotenv').config()

const R = require('ramda')
const pprompt = require('password-prompt')

const Adapter = require('hubot/src/adapter')
const TextMessage = require('hubot/src/message').TextMessage

const logger = require('logdown')('hubot-wire')
const { APIClient } = require('@wireapp/api-client')
const { ClientType } = require('@wireapp/api-client/dist/commonjs/client/')
const { Account } = require('@wireapp/core')
const { FileEngine } = require('@wireapp/store-engine')
const { PayloadBundleType } = require('@wireapp/core/dist/conversation/root')

const wire = {
  engine: new FileEngine(),
  client: null,
  account: null,
  adapter: null,
  loginData: {
    clientType: ClientType.PERMANENT,
    email: process.env.WIRE_EMAIL,
    password: null
  }
}

// flog :: Object -> Object
const infolog = (str, value) => {
  logger.info(str)
  return value
}
const getWirePassword = () => {
  return process.env.WIRE_PASSWORD === undefined
    ? pprompt('Password: ')
    : Promise.resolve(process.env.WIRE_PASSWORD)
}
const setupGlobals = (engine, adapter, password) => {
  wire.loginData.password = password
  wire.client = new APIClient({ store: engine, urls: APIClient.BACKEND.PRODUCTION })
  wire.account = new Account(wire.client)
  wire.adapter = adapter
  logger.log('Wire client object built')
  initEventListeners(wire.account)
  logger.log('Wire event handlers set')
  return password
}
// initEngine :: _ -> Promise
const initEngine = (engine) => engine.init('hubot-wire')
// initEventListeners :: account -> account
const initEventListeners = (account) => {
  return account.on(PayloadBundleType.CONFIRMATION, handleConfirmation)
    .on(PayloadBundleType.TEXT, handleText)
    .on(PayloadBundleType.LAST_READ_UPDATE, handleReadUpdate)
    .on(PayloadBundleType.ASSET, sendConfirmation)
    .on(PayloadBundleType.ASSET_IMAGE, sendConfirmation)
    .on(PayloadBundleType.LOCATION, sendConfirmation)
    .on(PayloadBundleType.PING, sendConfirmation)
}
// login :: apiclient -> config -> Promise Context
const login = (account, loginData) => account.login(loginData)
// queryWireUser :: Object -> Promise HubotUser
const queryWireUser = (room, uid) => {
  const wireUserPromise = wire.client.user.api.getUser(uid)
  const hubotUserPromise = wireUserPromise.then(wireUser => {
    logger.log(`Queried Wire user data for uid ${uid}: ${wireUser.name}`)
    const hubotUser = wire.adapter.robot.brain.userForId(R.concat(room, uid), {
      name: wireUser.name,
      alias: wireUser.handle,
      room: room
    })
    return Promise.resolve(hubotUser)
  })
  return hubotUserPromise
}

// -- Handle messages ---------------------------------------------------------
// Convert Wire uid to Hubot User Promise
const wireUidToUser = (data) => {
  // Destructuring params
  const { conversation: room, from: uid } = data
  const brain = wire.adapter.robot.brain
  const hubotUid = R.concat(room, uid)
  return brain.users().hasOwnProperty(hubotUid)
    ? Promise.resolve(brain.userForId(hubotUid)) : queryWireUser(room, uid)
}
// Convert Wire payload to Hubot Message
// wireToMessage :: Object -> Promise Object
const wireToMessage = (data) => {
  const { content, id: messageId } = data
  const hubotUserPromise = wireUidToUser(data)
  return hubotUserPromise.then(hUser => {
    const msg = new TextMessage(hUser, content.text, messageId)
    logger.log('Converted incoming Wire to a Hubot message')
    return Promise.resolve(msg)
  })
}
const createConfirmation = (messageId) => wire.account.service.conversation.createConfirmation(messageId)
const sendConfirmation = (data) => {
  logger.log(`Send receipt confirmation for ${data.type} id ${data.id}`)
  return wire.account.service.conversation.createConfirmation(data.id)
}
const handleConfirmation = (data) => logger.log(`Got confirmation for msg id ${data.content.confirmMessageId}`)
const handleReadUpdate = (data) => logger.log(`Last read message ${data.messageId}`)
const handleText = (data) => {
  const { conversation: conversationId, content, from, id: messageId, type } = data
  logger.log(`Received "${type}" ("${messageId}") in "${conversationId}" from "${from}": ${content.text}`)
  const confirmationPayload = createConfirmation(messageId)
  wire.account.service.conversation.send(conversationId, confirmationPayload)
    .then(val => wireToMessage(data))
    .then(val => wire.adapter.receive(val))
    .catch(e => logger.error('Error', e))
}

// -- Set up and listen --------------------------------------------------------
// https://github.com/hubotio/hubot/blob/master/src/adapter.js
class Wire extends Adapter {
  send (envelope, ...strings) {
    logger.info(`Send ${JSON.stringify(envelope)}, ${strings}`)
    // TODO build asset messages for e.g. images
    // const links = R.filter(R.startsWith('_asset'), strings)
    const textPayload = wire.account.service.conversation.createText(strings[0]).build()
    wire.account.service.conversation.send(envelope.room, textPayload)
      .then(val => logger.log(`Sent text with id ${val.id}`))
  }

  emote (envelope) {
    logger.warn(`emote ${JSON.stringify(envelope)}`)
  }

  reply (envelope) {
    logger.warn(`reply ${JSON.stringify(envelope)}`)
  }

  topic (envelope) {
    logger.warn(`topic ${JSON.stringify(envelope)}`)
  }

  play (envelope) {
    logger.warn(`play ${JSON.stringify(envelope)}`)
  }

  run () {
    logger.log('Starting...')
    this.robot.logger.info('robot Starting')
    initEngine(wire.engine)
      .then(val => infolog(`Initialized FileEngine, store name ${val}`, val))
      .then(val => getWirePassword())
      .then(password => setupGlobals(wire.engine, this, password))
      .then(val => login(wire.account, wire.loginData))
      .then(val => infolog(`Logged in as ${val.userId}, client ${val.clientId}`, val))
      .then(val => wire.account.listen())
      .then(val => infolog('Listening for messages ...', val))
      .then(val => this.emit('connected'))
      .catch(e => logger.error('Error', e))
  }

  close () {
    logger.log('Logging out')
    wire.account.logout()
      .then(val => infolog('Logout succeed, shutting down.'))
      .then(val => this.robot.shutdown())
  }
}

exports.use = robot => new Wire(robot)
