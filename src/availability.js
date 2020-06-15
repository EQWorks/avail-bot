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
const getTasksForProject = async ({
  wsName = 'eqworks.com',
  teamName = 'Dev',
  projectName = 'Dev Avail',
  sectionName = false,
  userName = false,
  rawParams = { completed_since: 'now' },
  now = true,
}) => {
  try {
    const workspace = await getWorkspaceId(wsName)
    const team = await getTeamId(workspace, teamName)
    const project = await getProjectId(projectName, { team })
    const params = {
      opt_fields: `workspace.name,projects.name,tags.name,memberships.section,
        due_on,due_at,name,notes,completed,resource_subtype,assignee.name,custom_fields`,
      ...rawParams,
    }
    let sectionId
    if (sectionName) {
      sectionId = await getSectionId(project, sectionName)
      params.section = sectionId
    } else {
      params.project = project
    }
    // OLD USER FILTER, not suitable for searching w/ section (section is not returned)
    // let userId
    // if (userName) {
    //  userId = await getUserId({ project, workspace }, userName)
    //  params.assignee = userId
    //  params.workspace = workspace
    // }
    const tasks = await getTasks(params)
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

module.exports = getTasksForProject
