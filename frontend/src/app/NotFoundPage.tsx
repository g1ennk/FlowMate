import { systemMessages } from '../lib/messages'
import { SystemMessage } from '../ui/SystemMessage'

function NotFoundPage() {
  return (
    <SystemMessage
      placement="layout"
      title={systemMessages.notFound.title}
      body={systemMessages.notFound.body}
      primary={{ label: systemMessages.goToPlan, to: '/todos' }}
    />
  )
}

export default NotFoundPage
