const client = require('./client')


// TODO:
//  - reduce api calls
//  - REFACTOR!! 
//  - logic for the weekend/holiday
//      |-> const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
//      |-> effort repo for libs


const DEV_JOURNAL = "1153484903445659"

const getTaskById = (id) => client.tasks.findById(id).then((res) => res)

const getSubTaskById = (id) => client.tasks.subtasks(id).then((res) => res.data)

// get everybody's journals
const getJournals = (params, completed) => {
  return client.tasks.findAll(params).then(({ data }) => {
    const prevDayTasks = data.filter((task) => task.due_on && new Date(`${task.due_on}T23:59:59.999Z`) < new Date())
    const taskArr = prevDayTasks.map(async (t) => {
      const incompTaskParams = await getSubTasks(t, completed)
      const prevTask = await getTaskById(t.gid)
      return {
        gid: prevTask.gid,
        name: prevTask.name,
        assignee: prevTask.assignee,
        projects: prevTask.projects[0].gid,
        workspace: prevTask.workspace.gid,
        subTasks: incompTaskParams,
      }
    })
    return Promise.all(taskArr).then((res) => res)
  })
}

// get incomplete subtasks for each task
const getFilteredTasks = async (task, completed) => {
  const subTasks = await getSubTaskById(task.gid)
  const tasks = subTasks.map(async (t) => {
    const task = await getTaskById(t.gid)
    if (task.completed === false && !completed) {
      return task
    } else if (task.completed && completed) {
      return task
    }
  })
  return Promise.all(tasks).then((res) => res.filter(r => r !== undefined))
}

// get subTasks and children of subTasks
const getSubTasks = async (task, completed) => {
  let tasks = completed ? await getFilteredTasks(task, true) : await getFilteredTasks(task, false)
  if (tasks.length > 0) {
    const taskParam = tasks.map(async (t) => {
      let subChildTasks = completed? await getFilteredTasks(t, true) : await getFilteredTasks(t, false)
      if (subChildTasks.length > 0) {
        const subChildParams = subChildTasks.map(async (child) => {
          return {
            name: child.name,
            subTasks: await getSubTasks(child),
          }
        })
        const childTasks = await Promise.all(subChildParams).then((r) => r)
        return { name: t.name, subTasks: childTasks }
      } else {
        return { name: t.name, subTasks: [] }
      }
    })
    return Promise.all(taskParam).then((r) => r)
  }
  return []
}

// create new journal
const createJournal = (param) => client.tasks.create(param).then((res) => res)

// complete/incomplete sub tasks and task id
const createSubTasks = (taskId, subTasks) => {
  subTasks.forEach(async (task) => {
    // task: { name: '', subTask: [] }
    const subTaskParam = { name: task.name }
    if (task.subTasks.length > 0) {
      client.tasks.addSubtask(taskId, subTaskParam).then((r) => {
        createSubTasks(r.gid, task.subTasks)
      })
    } else {
      client.tasks.addSubtask(taskId, subTaskParam)
    }
  })
}                                 

const createNewJournals = async () => {
  try {
    const params = {
      project: DEV_JOURNAL,
      completed_since: 'now',
      opt_fields: 'completed,projects.name,due_on,name,notes,subtasks,assignee.name,custom_fields',
    }
    const completed = false

    const journals = await getJournals(params, completed)

    journals.map(async (journal) => {
      if (journal.subTasks.length > 0) {
        // const createJournalParams = {
        //   name: `TEST-${journal.name}`,
        //   assignee: journal.assignee.gid,
        //   completed: false,
        //   due_on: `${new Date().getFullYear()}-0${new Date().getMonth() + 1}-${new Date().getDate()}`,
        //   projects: [journal.projects],
        //   workspace: journal.workspace,
        // }
        const createJournalParams = {
          name: `TEST-${journal.name}`,
          completed: false,
          due_on: `${new Date().getFullYear()}-0${new Date().getMonth() + 1}-${new Date().getDate() + 1}`,
          projects: [journal.projects],
          workspace: journal.workspace,
        }
        const newJournal = await createJournal(createJournalParams)
        createSubTasks(newJournal.gid, journal.subTasks)
      }
    })
  } catch (e) {
    console.error(e)
    return false
  }
}

createNewJournals()


