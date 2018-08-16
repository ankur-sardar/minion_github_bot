/**
 * This is the entry point for your Probot App.
 * @param {import('probot').Application} app - Probot's Application class.
 */

// Native
const { join } = require('path')

// Packages
const command = require('probot-commands')

// Ours
// const ensure = require('./lib/ensure')
// const test = require('./lib/test')
const update = require('./lib/update')
const deprecate = require('./lib/helpers/deprecate')
const toggle = require('./lib/toggle')



module.exports = app => {
  // Your code here
  app.log('Yay, the app was loaded!')

  app.on('issues.opened', async context => {
    const issueComment = context.issue({ body: 'Thank you for opening this issue!' })
    app.log('There is a new Issue created')
    app.log(issueComment);
    return context.github.issues.createComment(issueComment)
  })

  command(app, 'label', (context, command) => {
    app.log('Adding New label')
    const labels = command.arguments.split(/, */);
    return context.github.issues.addLabels(context.issue({labels}));
  });

  // Toggle label
  app.on('pull_request.opened', toggle)
  app.on('pull_request.edited', toggle)

  // Re-check on dependency updates
  app.on('issues.closed', update)
  app.on('issues.reopened', update)
  app.on('pull_request.reopened', update)
  app.on('pull_request.closed', update)
  app.on('pull_request.synchronize', update)

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
}
