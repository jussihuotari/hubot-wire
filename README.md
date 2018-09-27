# A Hubot adapter for Wire

[Wire](https://github.com/wireapp) is a secure messenger. I needed a bot for
Wire, and [Hubot](https://github.com/hubotio/hubot), while old, seemed fit for
purpose.

This is a Wire-adapter for Hubot, enabling Hubot to communicate with me through
Wire's secure platform. 

My first intuition was to utilize Wire's
[bot-api](https://github.com/wireapp/bot-sdk-node) but that turned out to be
rather complicated. It seems like the team at Wire is still working on their
business model, and struggle to maintain the API docs and tools. See e.g.
https://github.com/wireapp/bot-sdk-node/issues/23 .

I settled for using a regular Wire account with the
[api-client](https://github.com/wireapp/wire-web-packages/tree/master/packages/api-client).
Now the bot acts as a regular Wire user.

## Usage

As this is not available as a NPM module, you use a clone of this repo. Clone
the repo to a local directory, e.g. `hubot-wire`. Go to your Hubot installation
and `npm link ../hubot-wire`. Start Hubot with `-a wire` command line argument.

Hubot's default start script does some NPM work and messes with the npm link. I
resorted to start Hubot using
`PATH="node_modules/.bin:node_modules/hubot/node_modules/.bin:$PATH"
NODE_PATH="./node_modules" HUBOT_LOG_LEVEL=debug node_modules/.bin/hubot --name
"bot" -a wire`
