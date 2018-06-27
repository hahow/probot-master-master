const github = require('@octokit/rest')()
const axios = require('axios')
const get = require('lodash/get')
const getConfig = require('probot-config')

const defaultConfig = require('./defaultConfig')
const slackDisplayNameByGithubUserId = require('./slackDisplayNameByGithubUserId')

function formatGithubUserIdToSlackLinkingText (githubUserId) {
  const slackDisplayName = get(slackDisplayNameByGithubUserId, githubUserId)

  const linkingText = slackDisplayName ? `<@${slackDisplayName}>` : '<!channel>'

  return linkingText
}

github.authenticate({
  type: 'token',
  token: process.env.GITHUB_PERSONAL_ACCESS_TOKENS,
})

module.exports = app => {
  // Your code here
  app.log('Yay, the app was loaded!')

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/

  app.on('pull_request', async context => {
    // Code was pushed to the repo, what should we do with it?
    app.log(context)

    const customConfig = await getConfig(context, 'probot-master-master.yml')

    const config = Object.assign({}, defaultConfig, customConfig)

    app.log(config)

    const action = get(context, 'payload.action');

    if (action === 'opened') {
      const targetBranch = get(context, 'payload.pull_request.base.ref')

      if (targetBranch === config.targetBranch) {
        const authorUserId = get(context, 'payload.pull_request.user.id')
        const formattedSlackDisplayName = formatGithubUserIdToSlackLinkingText(authorUserId)

        const repo = get(context, 'payload.repository.name')
        const owner = get(context, 'payload.repository.owner.login')
        const head = get(context, 'payload.pull_request.head.label')
        const number = get(context, 'payload.pull_request.number')
        const assignees = get(context, 'payload.pull_request.assignees')
          .map(assignee => get(assignee, 'login'))

        const { data: branches } = await github.repos.getBranches({
          owner,
          repo,
          per_page: 100,
        })

        const text = `嗨 ${formattedSlackDisplayName}！看起來你在 ${repo} 建立了一個 merge ${config.targetBranch} 的 PR...`

        const options = branches.map(branch => ({
          text: branch.name,
          value: JSON.stringify({
            owner,
            repo,
            head,
            base: branch.name,
            number,
            assignees,
          }),
        }))

        const response = await axios({
          method: 'post',
          url: 'https://slack.com/api/chat.postMessage',
          headers: {
            Authorization: `Bearer ${process.env.SLACK_OAUTH_ACCESS_TOKEN}`,
          },
          data: {
            channel: config.slackChannel,
            text,
            response_type: 'in_channel',
            attachments: [
              {
                text: '需要本蛙爺再幫你建立一個 merge 其它 branch 的 PR 嗎？',
                fallback: '',
                callback_id: 'pr_branch',
                color: '#949EA6',
                attachment_type: 'default',
                actions: [
                  {
                    name: 'branch_list',
                    text: '選擇一個 branch...',
                    type: 'select',
                    options,
                  },
                ],
              }
            ],
          },
        })
      }
    }
  })
}
