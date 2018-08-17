/**
 * This is the entry point for your Probot App.
 * @param {import('probot').Application} app - Probot's Application class.
 */

// Native
const { join } = require('path')

// Packages
const command = require('probot-commands')
const createScheduler = require('probot-scheduler')

// Ours
// const ensure = require('./lib/ensure')
// const test = require('./lib/test')
const update = require('./lib/update')
const deprecate = require('./lib/helpers/deprecate')
const toggle = require('./lib/toggle')
const handlePullRequestChange = require('./lib/handle-work-in-progress')
const reminders = require('./lib/reminders')

// TODO handler
const pullRequestHandler = require('./lib/pull-request-handler')
const pullRequestMergedHandler = require('./lib/pull-request-merged-handler')
const pushHandler = require('./lib/push-handler')
const issueRenameHandler = require('./lib/issue-rename-handler')
process.env.APP_NAME = 'todo'

// Request info handler
const getComment = require('./lib/getComment')
const defaultConfig = require('./lib/defaultConfig')
const PullRequestBodyChecker = require('./lib/PullRequestBodyChecker')
const getConfig = require('probot-config')

// Delete Branch after merge
const deleteMergedBranch = require('./lib/delete-merged-branch')

// Create New Branch on issue number
const createNewBranch = require('./lib/create-new-branch')



module.exports = robot => {
  // Your code here
  robot.log('Yay, the app was loaded!')

  // robot.on('issues.opened', async context => {
  //   // const issueComment = context.issue({ body: 'Thank you for opening this issue!' })
  //   robot.log('There is a new Issue created')
  //   // robot.log(issueComment);
  //   // return context.github.issues.createComment(issueComment)    
  // })
  robot.on(`issues.opened`, createNewBranch)
  robot.on(`issues.assigned`, createNewBranch)

  command(robot, 'label', (context, command) => {
    robot.log('Adding New label')
    const labels = command.arguments.split(/, */);
    return context.github.issues.addLabels(context.issue({labels}));
  });

  // Handle Reminders

  createScheduler(robot, {interval: 15 * 60 * 1000})
  command(robot, 'remind', reminders.set)
  robot.on('schedule.repository', reminders.check)

  // Handle Work In Progress

  robot.on([
    'pull_request.opened',
    'pull_request.edited',
    'pull_request.labeled',
    'pull_request.unlabeled',
    'pull_request.synchronize'
  ], handlePullRequestChange)



  // Re-check on dependency updates
  robot.on('issues.closed', update)
  robot.on('issues.reopened', update)
  robot.on('pull_request.reopened', update)
  robot.on('pull_request.closed', update)
  robot.on('pull_request.synchronize', update)




  // Add TODO features
  
  // PR handler (comments on pull requests)
  robot.on(['pull_request.opened', 'pull_request.synchronize'], pullRequestHandler)

  // Merge handler (opens new issues)
  robot.on('pull_request.closed', pullRequestMergedHandler)

  // Push handler (opens new issues)
  robot.on('push', pushHandler)

  // Prevent tampering with the issue title
  robot.on('issues.edited', issueRenameHandler)



  // Handle Request More Info feature
  robot.on(['pull_request.opened', 'issues.opened'], receive)
  async function receive (context) {
    let title
    let body
    let badTitle
    let badBody
    let user

    let eventSrc = 'issue'
    if (context.payload.pull_request) {
      ({title, body, user} = context.payload.pull_request)
      eventSrc = 'pullRequest'
    } else {
      ({title, body, user} = context.payload.issue)
    }

    try {
      const config = await getConfig(context, 'config.yml', defaultConfig)

      robot.log(config)

      if (!config.requestInfoOn[eventSrc]) {
        return
      }

      if (config.requestInfoDefaultTitles) {
        if (config.requestInfoDefaultTitles.includes(title.toLowerCase())) {
          badTitle = true
        }
      }

      if (eventSrc === 'pullRequest') {
        if (!(await PullRequestBodyChecker.isBodyValid(body, config, context))) {
          badBody = true
        }
      }

      let notExcludedUser = true
      if (config.requestInfoUserstoExclude) {
        if (config.requestInfoUserstoExclude.includes(user.login)) {
          notExcludedUser = false
        }
      }
      if ((!body || badTitle || badBody) && notExcludedUser) {
        const comment = getComment(config.requestInfoReplyComment, defaultConfig.requestInfoReplyComment)
        context.github.issues.createComment(context.issue({body: comment}))

        if (config.requestInfoLabelToAdd) {
          // Add label if there is one listed in the yaml file
          context.github.issues.addLabels(context.issue({labels: [config.requestInfoLabelToAdd]}))
        }
      }
    } catch (err) {
      if (err.code !== 404) {
        throw err
      }
    }
  }

  //Delete Branch after merge
  robot.on(`pull_request.closed`, deleteMergedBranch)

  // Add a branch on issue name
  robot.on('issues.opened', async context => {
    robot.on(`pull_request.closed`, createNewBranch)
  })

  // Add Label based on Titel or body content

  robot.on(['issues.opened', 'issues.edited'], async context => {
    const config = [await context.config('labeler.yml', { numLabels: 20 })]
    const labels = await context.github.issues.getLabels(context.issue({ per_page: config.numLabels }))
    const issue = await context.github.issues.get(context.issue())

    let labelList = []
    let labelsToAdd = []

    labels.data.map(label => labelList.push(label.name))
    labelList
      .map(label => issue.data.title.toLowerCase().includes(label) || issue.data.body.toLowerCase().includes(label) ? labelsToAdd.push(label) : null)

    return context.github.issues.addLabels(context.issue({ labels: labelsToAdd }))
  })


  

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
}
