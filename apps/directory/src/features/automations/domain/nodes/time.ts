import { defaultAutomationSchedule, parseAutomationSchedule, validateAutomationSchedule } from '../schedule'
import { defineNode } from '../node-descriptor'

export const timeNode = defineNode({
  kind: 'time',
  meta: { name: 'Time', description: 'Start on a schedule.', group: 'Triggers' },
  inputs: 'none',
  createConfig: () => ({ schedule: defaultAutomationSchedule() }),
  ports: () => [{ id: 'then', label: 'Then' }],
  parseConfig: (config) => ({ schedule: parseAutomationSchedule(config.schedule) }),
  validate: (node, push) => {
    const scheduleError = validateAutomationSchedule(node.config.schedule)
    if (scheduleError) push('schedule', scheduleError)
  },
  allowedTargets: (port) => (port === 'then' ? ['scraper', 'agent'] : []),
})
