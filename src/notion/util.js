const util = require('util')
const notion = require('./notion-client')


const showObject = (obj) => util.inspect(obj, { showHidden: false, depth: null })

const _getDay = (date) => (day) => new Date(date).getUTCDay() === day
const subtractMe = (date) => (_getDay(date)(1) ? 3 : 1)
const prevWorkDay = (date) => (
  new Date(new Date().setDate(new Date(date).getUTCDate() - subtractMe(date)))
).toISOString().split('T')[0]
const currentDay = _getDay(new Date())
const isWeekend = currentDay(6) || currentDay(0)

const getJournals = async ({ database_id, filters: { date } }) => {
  const { results = [] } = await notion.databases.query({
    database_id,
    filter: { property: 'Date', date: { equals: date } },
  })
  return results.map(({ id, properties: { Assignee, Name, Idle } }) => (
    { id, Name, Assignee, Idle }
  ))
}

const filterTasks = ({ tasks, completed }) => tasks.map(({ to_do }) => {
  if (to_do && to_do.checked === completed) {
    return to_do.text
  }
  return false
}).filter((r) => r)
const getJournalTasks = async ({ block_id }) => {
  const { results = [] } = await notion.blocks.children.list({ block_id })
  return {
    completedTasks: filterTasks({ tasks: results, completed: true }),
    incompleteTasks: filterTasks({ tasks: results, completed: false }),
  }
}

const formatChildren = (tasks) => (tasks.map((t) => ({
  object: 'block',
  type: 'to_do',
  to_do: { text: t },
})))

// format completed tasks into single string
//    --> TODO: match format with updates
const formatLWD = (tasks) => {
  if (tasks.length) {
    const taskPlainText = tasks.map((task) => (task.map(({ plain_text }) => plain_text)).join(''))
    return `* ${taskPlainText.join('\n* ')}`
  }
  return ''
}

const nameTransform = ({ Name, incompleteTasks }) => {
  const { title: [{ plain_text: name }] } = Name
  let plain_text = name
  const m = name.match(/(?<person>.*)[(]\d+[)]$/)
  if (m) {
    const { groups: { person } } = m
    plain_text = `${person.trim()} (${incompleteTasks.length})`
  }
  return ({
    ...Name,
    title: [{
      ...Name.title[0],
      text: { ...Name.title[0].text, content: plain_text },
      plain_text,
    }],
  })
}

const filterIdle = async (prevDayJournals) => {
  const activeJournals = await Promise.all(prevDayJournals.map(async ({ id, Idle, Name, Assignee }) => {
    const { completedTasks, incompleteTasks } = await getJournalTasks({ block_id: id })
    let idle = Idle

    if (Idle && completedTasks.length) {
      idle = undefined
    }
    if (!completedTasks.length) {
      if (Idle) {
        const { number } = Idle
        if (number >= 5) return null
        idle = { ...Idle, number: Idle.number + 1 }
      } else {
        idle = { type: 'number', number: 1 }
      }
    }

    return { id, Idle: idle, Name, Assignee, completedTasks, incompleteTasks }
  }))
  return activeJournals.filter((r) => r)
}

module.exports = {
  showObject,
  prevWorkDay,
  getJournals,
  getJournalTasks,
  formatChildren,
  formatLWD,
  nameTransform,
  filterIdle,
  isWeekend,
}
