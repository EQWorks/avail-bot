const client = require('./client')


const _getDay = (date) => (day) => new Date(date).toUTCString().toLocaleLowerCase().startsWith(day)
const _checkDateRange = (start_on, due_on) => (date) => (
  (date >= start_on && date <= due_on) || date === due_on
)
const currentDay = _getDay(new Date())
const subtractMe = (date) => (_getDay(date)('mon') ? 3 : 1)
const prevWorkDay = (date) => (
  new Date(new Date().setDate(new Date(date).getUTCDate() - subtractMe(date)))
).toISOString().split('T')[0]

const today = `${new Date().toISOString().split('T')[0]}`
const isWeekend = currentDay('sat') || currentDay('sun')
const AVAIL_PROJECT = 1152701043959235

// check avail to return users (1) currently on vacay (2) returning from vacay
const availCheck = async () => {
  const [{ gid: VACAY_GID }] = await client.sections.getSectionsForProject(AVAIL_PROJECT)
    .then(({ data }) => data.filter(({ name }) => name.toLowerCase().startsWith('vacation')))
    .catch((e) => console.error(`Failed to fetch sections for avail project: ${e}`))

  const avails = await client.tasks.getTasksForSection(
    VACAY_GID,
    { limit: 50, opt_fields: 'start_on,due_on,name,assignee' },
  ).then(({ data }) => {
    const onVacayPrevDay = []
    const onVacayCurrentDay = []
    data.forEach((task) => {
      const { start_on, due_on } = task
      const isAway = _checkDateRange(start_on, due_on)
      if (isAway(prevWorkDay(today))) onVacayPrevDay.push(task)
      if (isAway(today)) onVacayCurrentDay.push(task)
    })

    const isOnVacay = onVacayCurrentDay.map((t) => t?.assignee?.gid)
    const backFromVacay = onVacayPrevDay.filter((t) => !isOnVacay.includes(t?.assignee?.gid))
    return { onVacayPrevDay, onVacayCurrentDay, backFromVacay, isOnVacay }
  }).catch((e) => console.error(`Failed to fetch avail: ${e}`))

  return avails
}

// get last-work-day journals
const getLWDJournals = async (DEV_JOURNAL, { backFromVacay, isOnVacay }) => {
  let prevDayTasks = await client.tasks
    .getTasksForProject(
      DEV_JOURNAL,
      {
        opt_fields: 'due_on,custom_fields,name,assignee,projects,workspace',
        completed_since: prevWorkDay(today),
      },
    )
    .then((r) => r.data.filter(({ due_on, assignee }) => (
      due_on === prevWorkDay(today) && !isOnVacay.includes(assignee?.gid)
    )))
    .catch((e) => console.error(`Failed to fetch prev-work-day tasks: ${e}`))

  // add tasks for people that are back from vacay
  const prevVacayTasks = await Promise.all(backFromVacay.map((t) => {
    const assigneeGID = t?.assignee?.gid
    const vacayStartDate = t?.start_on || t?.due_on
    const prevVacay = prevWorkDay(vacayStartDate)

    return client.tasks
      .getTasksForProject(
        DEV_JOURNAL,
        {
          completed_since: prevVacay,
          opt_fields: 'due_on,custom_fields,name,assignee,projects,workspace',
        },
      )
      .then((r) => r.data.find((t) => t?.due_on === prevVacay && t?.assignee?.gid === assigneeGID))
      .catch((e) => console.error(`Failed to fetch prev-work-day tasks: ${e}`))
  }))

  // add in prev-vacay tasks as prev-workday tasks
  prevDayTasks = [...prevDayTasks, ...prevVacayTasks]

  const getSubTasks = (task) => client.tasks
    .getSubtasksForTask(task, { opt_fields: 'gid,name,completed,resource_type' })
    .then((r) => r.data)
    .catch((e) => console.error(`Failed to fetch subtasks: ${e}`))

  return Promise.all(prevDayTasks
    .map(async ({ gid, name, assignee, projects, workspace, custom_fields }) => {
      const subTasks = await getSubTasks(gid)
      return {
        gid,
        name,
        assignee,
        projects: projects[0].gid,
        workspace: workspace.gid,
        incompleteSubTasks: subTasks.filter((t) => !t.completed),
        completedSubTasks: subTasks.filter((t) => t.completed),
        customField: custom_fields.find((c) => c.name === 'Last Workday').gid,
      }
    }))
}

// format completed tasks into single string
//    --> TODO: match format with updates
const formatLWD = (tasks) => {
  if (tasks.length) {
    const notes = tasks.map((t) => t.name)
    return `* ${notes.join('\n* ')}`
  }
  return ''
}

// create new journals
module.exports.createJournals = async (DEV_JOURNAL) => {
  if (isWeekend) {
    return
  }
  try {
    const avails = await availCheck()
    const prevJournals = await getLWDJournals(DEV_JOURNAL, avails)
    await Promise.all(prevJournals.map(async ({
      name,
      assignee,
      completedSubTasks,
      incompleteSubTasks,
      projects,
      workspace,
      customField,
    }) => {
      const nameTransform = (name) => {
        const m = name.match(/(?<person>.*)[(]\d+[)]$/)
        if (m) {
          const { groups: { person } } = m
          return `${person.trim()} (${incompleteSubTasks.length})`
        }
        return name
      }
      const params = {
        name: nameTransform(name),
        assignee,
        completed: false,
        due_on: today,
        projects: [projects],
        workspace,
        custom_fields: { [customField]: formatLWD(completedSubTasks) },
      }
      const { gid } = await client.tasks.createTask(params)
      if (!gid) {
        return
      }

      await Promise.all(incompleteSubTasks.map((t) => (
        client.tasks.createSubtaskForTask(gid, { name: t.name })
      )))
    }))
  } catch (e) {
    console.error(`Failed to create new journals: ${e}`)
  }
}
