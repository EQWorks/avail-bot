const client = require('./client')


const DEV_JOURNAL = '1153484903445659'
const dayOfWeek = new Date().getDay()
// const isWeekend = dayOfWeek === 6 || dayOfWeek === 0
const isMonday = dayOfWeek === 1
const subtractMe = isMonday ? 3 : 1
const day = new Date(new Date().setDate(new Date().getDate() - subtractMe)) // TODO: check holiday
const dayString = `${day.getFullYear()}-0${day.getMonth() + 1}-${day.getDate()}`
const params = {
  project: DEV_JOURNAL,
  opt_fields: 'completed,projects.name,due_on,name,notes,subtasks,assignee.name,custom_fields',
}

const getTaskById = (id) => client.tasks.findById(id).then((res) => res)

const getSubTaskById = (id) => client.tasks.subtasks(id).then((res) => res.data)

// filter for completed/incomplete subtasks for each task
const getFilteredTasks = async (task, completed) => {
  const subTasks = await getSubTaskById(task.gid)
  const tasks = subTasks.map(async (t) => {
    const task = await getTaskById(t.gid)
    if (task.completed === completed) return task
    return undefined
  })
  return Promise.all(tasks).then((res) => res.filter((r) => r !== undefined))
}

// get subTasks and children of subTasks
const getSubTasks = async (task, completed) => {
  const tasks = completed ? await getFilteredTasks(task, true) : await getFilteredTasks(task, false)
  if (tasks.length > 0) {
    const taskParam = tasks.map(async (t) => {
      const subChildTasks = completed
        ? await getFilteredTasks(t, true)
        : await getFilteredTasks(t, false)
      if (subChildTasks.length > 0) {
        const subChildParams = subChildTasks.map(async (child) => ({
          name: child.name,
          subTasks: await getSubTasks(child, completed),
        }))
        const childTasks = await Promise.all(subChildParams).then((r) => r)
        return { name: t.name, subTasks: childTasks }
      }
      return { name: t.name, subTasks: [] }
    })
    return Promise.all(taskParam).then((r) => r)
  }
  return []
}

const _getJournals = (params) => async () => {
  const { data } = await client.tasks.findAll(params)
  const customFieldGid = data.map((t) => t.custom_fields)
  const taskArr = data
    .filter((task) => (task.due_on && task.due_on === dayString))
    .map(async (t) => {
      const compTaskParams = await getSubTasks(t, true)
      const incompTaskParams = await getSubTasks(t, false)
      const prevTask = await getTaskById(t.gid)
      return {
        gid: prevTask.gid,
        name: prevTask.name,
        assignee: prevTask.assignee,
        projects: prevTask.projects[0].gid,
        workspace: prevTask.workspace.gid,
        incompleteSubTasks: incompTaskParams,
        completedSubTasks: compTaskParams,
        customField: customFieldGid[0][0].gid,
      }
    })
  const res = await Promise.all(taskArr)
  return res
}

const _getFieldInfo = (params) => async (field) => {
  const { data } = await client.tasks.findAll(params)
  const prevDayTasks = data.filter((task) => (task.due_on && task.due_on === dayString))
  let result
  if (field === 'lwd') {
    result = prevDayTasks.map((d) => {
      const lastWorkday = d.custom_fields[0].text_value
      if (lastWorkday) return { name: d.name, lastWorkday }
      return undefined
    })
  }
  if (field === 'des') {
    result = prevDayTasks.map((d) => {
      if (d.notes) return { name: d.name, description: d.notes }
      return undefined
    })
  }
  return result.filter((r) => r !== undefined)
}

module.exports.getJournals = _getJournals(params)
module.exports.getFieldInfo = _getFieldInfo(params)
