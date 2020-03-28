const Holidays = require('date-holidays')
const client = require('./client')


// TODO:
//  - reduce api calls
//  - REFACTOR!!
//  - logic for the weekend/holiday/vacation
//   |-> const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
//   |-> effort repo for libs

const HD = new Holidays('CA', 'ON')
const DEV_JOURNAL = '1153484903445659'
const dayOfWeek = new Date().getDay()
const isWeekend = dayOfWeek === 6 || dayOfWeek === 0

const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const getTaskById = (id) => client.tasks.findById(id).then((res) => res)
const getSubTaskById = (id) => client.tasks.subtasks(id).then((res) => res.data)

// filter for completed/incomplete subtasks for each task
const getFilteredTasks = async (task, completed) => {
  const subTasks = await getSubTaskById(task.gid)
  const tasks = subTasks.map(async (t) => {
    const task = await getTaskById(t.gid)
    if (task.completed && completed) {
      return task
    } else if (!task.completed && !completed) {
      return task
    }
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
        const subChildParams = subChildTasks.map(async (child) => (
          {
            name: child.name,
            subTasks: await getSubTasks(child, completed),
          }
        ))
        const childTasks = await Promise.all(subChildParams).then((r) => r)
        return { name: t.name, subTasks: childTasks }
      }
      return { name: t.name, subTasks: [] }
    })
    return Promise.all(taskParam).then((r) => r)
  }
  return []
}

// get everybody's journals
const getJournals = async (params) => {
  const { data } = await client.tasks.findAll(params)
  const customFieldGid = data.map((t) => t.custom_fields)
  const prevDayTasks = data.filter((task) => (
    task.due_on && new Date(`${task.due_on}T23:59:59.999Z`) < new Date()))
  const taskArr = prevDayTasks.map(async (t) => {
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

// create new journal
const createJournal = (param) => client.tasks.create(param).then((res) => res)

// create sub tasks for each parent task
const createSubTasks = (taskId, subTasks) => {
  if (subTasks.length > 0) {
    subTasks.forEach(async (task) => {
      // task: { name: '', subTask: [] }
      const subTaskParam = { name: task.name }
      if (task.subTasks.length > 0) {
        await timeout(30 * 1000)
        client.tasks.addSubtask(taskId, subTaskParam).then((r) => {
          createSubTasks(r.gid, task.subTasks)
        })
      } else {
        client.tasks.addSubtask(taskId, subTaskParam)
      }
    })
  }
}

// format completed tasks & subtasks into single string
const getLastJournalNotes = async (journal) => {
  const taskArr = journal.completedSubTasks || journal
  if (taskArr.length > 0) {
    const notes = taskArr.map(async (j) => {
      if (j.subTasks.length > 0) {
        const subNotesString = await getLastJournalNotes(j.subTasks)
        const subNotes = subNotesString.split('\n')
        return `${j.name}
        * ${subNotes.join('\n        * ')}`
      }
      return `${j.name}`
    })
    const noteArr = await Promise.all(notes).then((r) => r)
    return `- ${noteArr.join('\n- ')}`
  }
  return ''
}

const createNewJournals = async () => {
  if (HD.isHoliday(new Date()) || isWeekend) {
    return
  }

  try {
    const params = {
      project: DEV_JOURNAL,
      completed_since: 'now',
      opt_fields: 'completed,projects.name,due_on,name,notes,subtasks,assignee.name,custom_fields',
    }
    const journals = await getJournals(params)

    journals.map(async (journal) => {
      if (journal.incompleteSubTasks.length > 0 || journal.completedSubTasks.length > 0) {
        const lastJournalNotes = await getLastJournalNotes(journal)

        // const createJournalParams = {
        //   name: journal.name,
        //   assignee: journal.assignee.gid,
        //   completed: false,
        //   due_on: `${new Date().getFullYear()}-0${new Date().getMonth() + 1}-${new Date().getDate()}`,
        //   projects: [journal.projects],
        //   workspace: journal.workspace,
        //   custom_fields: { [journal.customField]: lastJournalNotes },
        // }

        const createJournalParams = {
          name: `TEST-${journal.name}`,
          completed: false,
          due_on: `${new Date().getFullYear()}-0${new Date().getMonth() + 1}-${new Date().getDate()}`,
          projects: [journal.projects],
          workspace: journal.workspace,
          custom_fields: { [journal.customField]: lastJournalNotes },
        }

        await timeout(30 * 1000)
        const newJournal = await createJournal(createJournalParams)
        await timeout(60 * 1000)
        createSubTasks(newJournal.gid, journal.incompleteSubTasks)
      }
    })
  } catch (e) {
    console.error(e)
  }
}

createNewJournals()
