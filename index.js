const asana = require('asana')

const { ASANA_TOKEN } = process.env

const client = asana.Client.create({
  defaultHeaders: {'asana-enable': 'string_ids,new_sections'},
}).useAccessToken(ASANA_TOKEN)


// client.tasks.findAll({
//   project: '',
//   opt_fields: 'due_on,name,completed'
// }).then

client.projects.tasks('1152701043959235', {
  completed_since: 'now',
  opt_fields: 'due_on,due_at,name,notes,completed',
}).then(({ data }) => {
  const past = data.filter(task => new Date(`${task.due_on} 23:59:59`) < new Date())
  Promise.all(past.map(({ gid }) => client.tasks.update(gid, { completed: true })))
}).then(console.log)
