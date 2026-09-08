import { httpRouter } from 'convex/server'
import { receive } from './verificationEntries/uploads'

const http = httpRouter()
http.route({ path: '/verification-attachments', method: 'POST', handler: receive })
export default http
