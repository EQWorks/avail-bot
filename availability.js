const client = require('./client')


const getUserInfo = () => client.users.me().then(user => console.log(user))

const getWorkspaceId = wsName => client.workspaces.findAll().then(res => {
	const workspace = res.data.find(({ name }) => name === wsName)
	return workspace ? workspace.gid : false
})

const getTeamId = (wsId, teamName) => client.teams.findByOrganization(wsId).then(res => {
	const team = res.data.find(({ name }) => name === teamName)
	return team ? team.gid : false
})

const getProjectId = (projectName, params) => client.projects.findAll(params).then(res => {
	const project = res.data.find(({ name }) => name === projectName)
	return project ? project.gid : false
})

const getSectionId = (project, sectionName) => client.sections.findByProject(project).then(res => {
	const section = res.find(({ name }) => name === sectionName)
	return section ? section.gid : false
})

const getUserId = (params, userName) => client.users.findAll(params).then(res => {
	const user = res.data.find(({ name }) => name === userName)
	return user ? user.gid : false
})

// params.section
// params.workspace
// params.project
const getTasks = (params) => client.tasks.findAll(params).then(res => {
	// data is array of tasks
	return res.data
})

const searchTasks = params => client.tasks.searchInWorkspace(params).then(res => {
	console.log(data)
	return res.data
})

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
		  opt_fields: 'workspace.name,projects.name,tags.name,memberships.section,due_on,due_at,name,notes,completed,resource_subtype,assignee.name,custom_fields',
		  ...rawParams,
		}
		let sectionId, userId
		if (sectionName) {
			sectionId = await getSectionId(project, sectionName)
			params.section = sectionId
		} else {
			params.project = project
		}
		// if (userName) {
		// 	userId = await getUserId({ project, workspace }, userName)
		// 	params.assignee = userId
		// 	params.workspace = workspace
		// }
		const tasks = await getTasks(params)
		console.log(tasks)
		return tasks
			.filter(({
				due_at,
				due_on,
				assignee,
			}) => (
				(!userName || ((assignee || {}).name === userName)) &&
				(!now || (now && (new Date(`${due_at ? due_at : `${due_on}T00:00:01`}`) < new Date())))
			))
			.map(({ name, due_at, due_on }) => ({ name, due_at, due_on }))
	} catch(e) {
		// next(e)
		console.log(e)
	}
}

// /avail Ianec -> get all for project, completed_since: now, filter by name
// /avail remote -> get all for project + section, return name
// /avail -> get all for project
const runQuery = async () => {
	const ret = await getTasksForProject({
		sectionName: 'in office',
		// userName: 'Leo Li',
		// now: false,
	})
	console.log(ret)
}

runQuery()
// userName + workspace, section, project can't be included together in {params}
// FLOW
// workspace > team > project > task (grouped by section or user)

