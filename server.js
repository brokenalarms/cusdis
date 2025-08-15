const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const { Server } = require('socket.io')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true)
    handle(req, res, parsedUrl)
  })

  const io = new Server(server, {
    cors: {
      origin: dev ? "http://localhost:3000" : false,
      methods: ["GET", "POST"]
    }
  })

  io.on('connection', (socket) => {
    
    // Join project-specific rooms for notifications
    socket.on('join-project', (projectId) => {
      socket.join(`project-${projectId}`)
    })

    socket.on('leave-project', (projectId) => {
      socket.leave(`project-${projectId}`)
    })

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id)
    })
  })

  // Make io instance available globally for use in API routes
  global.io = io

  const port = process.env.PORT || 3000
  server.listen(port, (err) => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${port}`)
  })
})