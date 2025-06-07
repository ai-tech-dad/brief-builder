const express = require('express');
const { WebClient } = require('@slack/web-api');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// These will come from your Slack app settings
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

const slack = new WebClient(SLACK_BOT_TOKEN);

// Verify requests are from Slack
function verifySlackRequest(req, res, next) {
  const signature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];
  const body = JSON.stringify(req.body);
  
  const time = Math.floor(new Date().getTime() / 1000);
  if (Math.abs(time - timestamp) > 300) {
    return res.status(400).send('Request timestamp too old');
  }
  
  const sigBasestring = 'v0:' + timestamp + ':' + body;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', SLACK_SIGNING_SECRET)
    .update(sigBasestring, 'utf8')
    .digest('hex');
  
  if (signature !== mySignature) {
    return res.status(400).send('Invalid signature');
  }
  
  next();
}

// Handle the /briefbuilder slash command
app.post('/briefbuilder', verifySlackRequest, async (req, res) => {
  const { trigger_id, user_id, channel_id } = req.body;
  
  // Define the modal with form fields
  const modal = {
    type: 'modal',
    callback_id: 'brief_submission',
    title: {
      type: 'plain_text',
      text: 'Creative Brief Builder'
    },
    submit: {
      type: 'plain_text',
      text: 'Create Brief'
    },
    close: {
      type: 'plain_text',
      text: 'Cancel'
    },
    blocks: [
      {
        type: 'input',
        block_id: 'project_name',
        element: {
          type: 'plain_text_input',
          action_id: 'project_name_input',
          placeholder: {
            type: 'plain_text',
            text: 'Enter project name'
          }
        },
        label: {
          type: 'plain_text',
          text: 'Project Name'
        }
      },
      {
        type: 'input',
        block_id: 'client',
        element: {
          type: 'plain_text_input',
          action_id: 'client_input',
          placeholder: {
            type: 'plain_text',
            text: 'Enter client name'
          }
        },
        label: {
          type: 'plain_text',
          text: 'Client'
        }
      },
      {
        type: 'input',
        block_id: 'audience',
        element: {
          type: 'plain_text_input',
          action_id: 'audience_input',
          multiline: true,
          placeholder: {
            type: 'plain_text',
            text: 'Describe the target audience'
          }
        },
        label: {
          type: 'plain_text',
          text: 'Target Audience'
        }
      },
      {
        type: 'input',
        block_id: 'objectives',
        element: {
          type: 'plain_text_input',
          action_id: 'objectives_input',
          multiline: true,
          placeholder: {
            type: 'plain_text',
            text: 'What are the key objectives?'
          }
        },
        label: {
          type: 'plain_text',
          text: 'Objectives'
        }
      },
      {
        type: 'input',
        block_id: 'deliverables',
        element: {
          type: 'plain_text_input',
          action_id: 'deliverables_input',
          multiline: true,
          placeholder: {
            type: 'plain_text',
            text: 'List the deliverables needed'
          }
        },
        label: {
          type: 'plain_text',
          text: 'Deliverables'
        }
      },
      {
        type: 'input',
        block_id: 'timeline',
        element: {
          type: 'plain_text_input',
          action_id: 'timeline_input',
          placeholder: {
            type: 'plain_text',
            text: 'Enter timeline/deadline'
          }
        },
        label: {
          type: 'plain_text',
          text: 'Timeline'
        }
      },
      {
        type: 'input',
        block_id: 'budget',
        element: {
          type: 'plain_text_input',
          action_id: 'budget_input',
          placeholder: {
            type: 'plain_text',
            text: 'Enter budget range'
          }
        },
        label: {
          type: 'plain_text',
          text: 'Budget'
        },
        optional: true
      },
      {
        type: 'input',
        block_id: 'additional_notes',
        element: {
          type: 'plain_text_input',
          action_id: 'notes_input',
          multiline: true,
          placeholder: {
            type: 'plain_text',
            text: 'Any additional notes or requirements'
          }
        },
        label: {
          type: 'plain_text',
          text: 'Additional Notes'
        },
        optional: true
      }
    ]
  };
  
  try {
    await slack.views.open({
      trigger_id: trigger_id,
      view: modal
    });
    
    res.status(200).send();
  } catch (error) {
    console.error('Error opening modal:', error);
    res.status(500).send('Error opening form');
  }
});

// Handle form submission
app.post('/slack/interactive', verifySlackRequest, async (req, res) => {
  const payload = JSON.parse(req.body.payload);
  
  if (payload.type === 'view_submission' && payload.view.callback_id === 'brief_submission') {
    const values = payload.view.state.values;
    
    // Extract form data
    const projectName = values.project_name.project_name_input.value;
    const client = values.client.client_input.value;
    const audience = values.audience.audience_input.value;
    const objectives = values.objectives.objectives_input.value;
    const deliverables = values.deliverables.deliverables_input.value;
    const timeline = values.timeline.timeline_input.value;
    const budget = values.budget.budget_input.value || 'Not specified';
    const notes = values.additional_notes.notes_input.value || 'None';
    
    // Format the brief
    const formattedBrief = `
# Creative Brief: ${projectName}

**Client:** ${client}
**Created by:** <@${payload.user.id}>
**Date:** ${new Date().toLocaleDateString()}

---

## Target Audience
${audience}

## Objectives
${objectives}

## Deliverables
${deliverables}

## Timeline
${timeline}

## Budget
${budget}

## Additional Notes
${notes}

---
*This brief was created using /briefbuilder*
    `.trim();
    
    try {
      // Post the formatted brief to the channel
      await slack.chat.postMessage({
        channel: payload.user.id, // Send as DM first
        text: 'Your creative brief is ready!',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '✅ Your creative brief has been created! You can copy the text below and paste it into Jira:'
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '```' + formattedBrief + '```'
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Share in Channel'
                },
                action_id: 'share_brief',
                value: JSON.stringify({
                  brief: formattedBrief,
                  channel: payload.view.private_metadata || payload.user.id
                })
              }
            ]
          }
        ]
      });
      
      res.status(200).json({
        response_action: 'clear'
      });
    } catch (error) {
      console.error('Error posting message:', error);
      res.status(500).send('Error creating brief');
    }
  }
});

// Handle button clicks (like sharing to channel)
app.post('/slack/actions', verifySlackRequest, async (req, res) => {
  const payload = JSON.parse(req.body.payload);
  
  if (payload.actions[0].action_id === 'share_brief') {
    const data = JSON.parse(payload.actions[0].value);
    
    try {
      await slack.chat.postMessage({
        channel: data.channel,
        text: 'New Creative Brief',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '📋 **New Creative Brief Created**'
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '```' + data.brief + '```'
            }
          }
        ]
      });
      
      res.status(200).send();
    } catch (error) {
      console.error('Error sharing brief:', error);
      res.status(500).send('Error sharing brief');
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Brief Builder app is running on port ${PORT}`);
});