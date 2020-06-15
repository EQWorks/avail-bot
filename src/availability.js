const client = require('./client')


const getWorkspaceId = (wsName) => client.workspaces.findAll().then((res) => {
  const workspace = res.data.find(({ name }) => name === wsName)
  return workspace ? workspace.gid : false
})

const getTeamId = (wsId, teamName) => client.teams.findByOrganization(wsId).then((res) => {
  const team = res.data.find(({ name }) => name === teamName)
  return team ? team.gid : false
})

const getProjectId = (projectName, params) => client.projects.findAll(params).then((res) => {
  const project = res.data.find(({ name }) => name === projectName)
  return project ? project.gid : false
})

const getSectionId = (project, sectionName) => client.sections.findByProject(project)
  .then((res) => {
    const section = res.find(({ name }) => name === sectionName)
    return section ? section.gid : false
  })

// https://developers.asana.com/docs/#tocS_CustomField
// https://developers.asana.com/docs/#search-tasks-in-a-workspace
/*
  custom_fields:
   [
      {
        gid: '1159688855981996',
        enabled: true,
        enum_options: [Array],
        enum_value: [Object],
        name: 'Status',
        resource_subtype: 'enum',
        resource_type: 'custom_field',
        type: 'enum',
      },
    ],
*/
// this requires project-wide custom field (manual in Asana)
// TODO: search using project or something else
const getCustomFieldsByWorkspace = (wsId) => client.customFields
  .findByWorkspace(wsId).then((res) => res.data)

// params.section
// params.workspace
// params.project
const getTasks = (params) => client.tasks.findAll(params).then((res) => res.data)
const getTasksForWorkspace = (workspace, params) => client.tasks.searchInWorkspace(workspace, params)
  .then((res) => res.data)
const updateTask = (taskId, params) => client.tasks.update(taskId, params).then((res) => res)

/* example utils

  const getUserInfo = () => client.users.me().then(user => console.log(user))

  const getUserId = (params, userName) => client.users.findAll(params).then(res => {
    const user = res.data.find(({ name }) => name === userName)
    return user ? user.gid : false
  })

  const searchTasks = params => client.tasks.searchInWorkspace(params).then(res => {
    return res.data
  })

*/

// -- workspace > team > project > task (grouped by section or user)
// -- userName + workspace, section, project can't be included together in {params}

// rawParams = { completed_since: 'now' },
// replace this ^^^^
// rawParams = { 'completed_at.after': new Date().toString(), completed: false },
// rawParams = { due_on: new Date().toISOString().substring(0, 10) }, ====> CURRENT

// =====> avail
// get all tasks where due_on = today
// anything timed today should be respected e.g. 12pm - 2pm Unavailable
// for time ranges, all we have is due_at. What convention can we use? due_at = end time
// then to express 12pm - 2pm unavail, I'd need:
// Avail - due_at 12pm
// Unavail - due_at 2pm
// Avail for today
// to express unavail UNTIL 2pm, I'd need:
// Unavail due_at 2pm
// Avail for today
// ===> then my query becomes: due_at.after: current_date_time OR due_on: current_date
// ===> and I need to manually filter by each person to get the correct current status
// ===> ?sort_by could help
// get vacation range e.g. starts_on: June 11, due_on: June 15th
// { start_on.before: tomorrow, due_on.after: tomorrow, completed:false } 
// new Date()

// =====> vacay
// all vacation this year

const getTasksForProject = async ({
  wsName = 'eqworks.com',
  teamName = 'Dev',
  projectName = 'Dev Avail',
  sectionName = false,
  userName = false,
  customFieldSearches = [], // [{ name, search }]
  rawParams = {},
  now,
}) => {
  try {
    const workspace = await getWorkspaceId(wsName)
    const team = await getTeamId(workspace, teamName)
    const project = await getProjectId(projectName, { team })
    let customFieldParams = {}
    if (customFieldSearches.length) {
      const customFields = await getCustomFieldsByWorkspace(workspace)
      customFieldParams = customFieldSearches.reduce((agg, { name, search }) => {
        const cf = customFields.find((o) => name === o.name)
        if (cf) {
          /*
            custom_fields.{gid}.is_set  All  Boolean
            custom_fields.{gid}.value  Text  String
            custom_fields.{gid}.value  Number  Number
            custom_fields.{gid}.value  Enum  Enum option ID
            custom_fields.{gid}.starts_with  Text only  String
            custom_fields.{gid}.ends_with  Text only  String
            custom_fields.{gid}.contains  Text only  String
            custom_fields.{gid}.less_than  Number only  Number
            custom_fields.{gid}.greater_than  Number only  Number
          */
          agg[`custom_fields.${cf.gid}.${search.type}`] = search.value
        }
        return agg
      }, {})
    }
    const params = {
      opt_fields: `workspace.name,projects.name,tags.name, tags.status, memberships.section,
        due_on,due_at,name,notes,completed,resource_subtype,assignee.name,custom_fields`,
      ...rawParams,
      ...customFieldParams,
    }
    let sectionId
    if (sectionName) {
      sectionId = await getSectionId(project, sectionName)
      params['sections.any'] = sectionId
    } else {
      params['projects.any'] = project
    }
    // OLD USER FILTER, not suitable for searching w/ section (section is not returned)
    // let userId
    // if (userName) {
    //  userId = await getUserId({ project, workspace }, userName)
    //  params.assignee = userId
    //  params.workspace = workspace
    // }
    // NOTE: changed to workspace search to support custom fields
    console.log(params)
    const tasks = await getTasksForWorkspace(workspace, params)
    return tasks
      .filter(({
        due_at,
        due_on,
        assignee,
      }) => (
        (!userName || ((assignee || {}).name === userName))
        && (!now
        || (now && (
          new Date(`${due_at || `${due_on}T00:00:01`}`) < new Date()
          && new Date(`${due_at || `${due_on}T23:59:59`}`) > new Date()
        )))
      ))
  } catch (e) {
    console.error(e)
    return false
  }
}

/*
  USAGE
  const ret = await getTasksForProject({
    sectionName: 'in office',
    userName: 'Leo Li',
    now: false,
  })
*/
const test = async () => {
  const ret = await getTasksForProject({
    rawParams: {
      'start_on.before': new Date().toISOString().substring(0, 10),
      'due_on.after': new Date().toISOString().substring(0, 10),
      // completed: false,
      opt_fields: `workspace.name,projects.name,tags.name, tags.status, memberships.section,
        due_on,due_at, start_on,name,notes,completed,resource_subtype,assignee.name,custom_fields`,
    },
  })
  console.log(ret)
}

test()



module.exports = { getTasksForProject, updateTask }
