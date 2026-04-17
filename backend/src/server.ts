import express, { Express, Request, Response } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const app: Express = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Setup Redis adapter for scaling across instances if REDIS_URL is set
(async () => {
  try {
    if (process.env.REDIS_URL) {
      const pubClient = createClient({ url: process.env.REDIS_URL });
      const subClient = pubClient.duplicate();
      await pubClient.connect();
      await subClient.connect();
      io.adapter(createAdapter(pubClient, subClient));
      console.log('🔗 Socket.IO Redis adapter attached');
    }
  } catch (err) {
    console.error('Redis adapter setup error:', err);
  }
})();

// Security Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Admin credentials setup (seed from env if provided)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@naruto.ai';
let ADMIN_PASSWORD_HASH: string | undefined = process.env.ADMIN_PASSWORD_HASH;

if (!ADMIN_PASSWORD_HASH && process.env.ADMIN_PASSWORD) {
  // Hash plaintext ADMIN_PASSWORD from env (only for initial setup/testing)
  ADMIN_PASSWORD_HASH = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
  console.log('🔐 Admin password hash generated from ADMIN_PASSWORD env var.');
}

// Admin login route
app.post('/admin/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });
  if (!ADMIN_PASSWORD_HASH) return res.status(500).json({ error: 'Admin login not configured' });
  if (email !== ADMIN_EMAIL) return res.status(401).json({ error: 'Invalid credentials' });
  const passwordsMatch = bcrypt.compareSync(password, ADMIN_PASSWORD_HASH);
  if (!passwordsMatch) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ role: 'admin', email: ADMIN_EMAIL }, process.env.ADMIN_JWT_SECRET || 'dev_secret', { expiresIn: '8h' });
  res.json({ token, email: ADMIN_EMAIL });
});

// Naruto AI Agents Configuration
const agents = [
  {
    id: 'kakashi-api-expert',
    name: 'Kakashi',
    title: 'Backend API Expert',
    jutsu: '⚡ Chidori',
    color: '#C0C0C0',
    description: 'Strategic API design and architecture',
    model: 'claude-3-5-sonnet',
    temperature: 0.7,
  },
  {
    id: 'itachi-react-specialist',
    name: 'Itachi',
    title: 'React & Frontend Expert',
    jutsu: '👁️ Susanoo',
    color: '#8B0000',
    description: 'Visual design and React architecture',
    model: 'claude-3-5-sonnet',
    temperature: 0.6,
  },
  {
    id: 'jiraiya-security-specialist',
    name: 'Jiraiya',
    title: 'Security Expert',
    jutsu: '🐸 Sage Mode',
    color: '#4B0082',
    description: 'Security, protection, and compliance',
    model: 'claude-3-5-sonnet',
    temperature: 0.3,
  },
  {
    id: 'minato-devops-infrastructure',
    name: 'Minato',
    title: 'DevOps Expert',
    jutsu: '⚡ Flying Raijin',
    color: '#FFD700',
    description: 'CI/CD, deployment, and infrastructure',
    model: 'claude-3-5-sonnet',
    temperature: 0.5,
  },
  {
    id: 'rock-lee-qa-expert',
    name: 'Rock Lee',
    title: 'QA Expert',
    jutsu: '💪 Taijutsu Mastery',
    color: '#228B22',
    description: 'Testing, quality assurance, and validation',
    model: 'claude-3-5-sonnet',
    temperature: 0.6,
  },
];

// REST API Routes
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: '🍃 Naruto AI Advisor API',
    version: '2.0.0',
    status: 'online',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/agents', (req: Request, res: Response) => {
  res.json({
    agents,
    total: agents.length,
    status: 'all agents ready',
  });
});

app.get('/api/agents/:id', (req: Request, res: Response) => {
  const agent = agents.find((a) => a.id === req.params.id);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  res.json(agent);
});

app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    agents: agents.length,
    webSocket: 'enabled',
  });
});

app.post('/api/chat', (req: Request, res: Response) => {
  const { agentId, message } = req.body;

  if (!agentId || !message) {
    return res.status(400).json({ error: 'Missing agentId or message' });
  }

  const agent = agents.find((a) => a.id === agentId);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  res.json({
    agentId,
    agentName: agent.name,
    message,
    response: `${agent.name}: Processing your request...`,
    timestamp: new Date().toISOString(),
  });
});

// WebSocket Events
io.on('connection', (socket) => {
  console.log(`✨ User connected: ${socket.id}`);

  // Send welcome message
  socket.emit('connected', {
    message: '🍃 Welcome to Naruto AI Advisor',
    agents,
    timestamp: new Date().toISOString(),
  });

  // Handle agent selection
  socket.on('select-agent', (data) => {
    const { agentId } = data;
    const agent = agents.find((a) => a.id === agentId);

    if (agent) {
      console.log(`🥷 Agent selected: ${agent.name}`);
      socket.emit('agent-selected', {
        agentId,
        agent,
        status: 'ready',
        message: `${agent.name} is ready to help!`,
      });
    } else {
      socket.emit('error', { message: 'Agent not found' });
    }
  });

  // Handle incoming messages
  socket.on('send-message', async (data) => {
    const { agentId, message, conversationId } = data;

    console.log(`💬 Message from ${socket.id}: ${message}`);

    const agent = agents.find((a) => a.id === agentId);
    if (!agent) {
      socket.emit('error', { message: 'Agent not found' });
      return;
    }

    // Emit thinking state
    socket.emit('agent-thinking', {
      agentId,
      agentName: agent.name,
      status: 'thinking',
    });

    // Simulate agent processing (in production, call Claude API here)
    setTimeout(() => {
      const response = `${agent.name}: I'm analyzing your question about "${message}". In a production environment, I would use Claude API to generate intelligent responses based on my specialty.`;

      socket.emit('agent-response', {
        agentId,
        agentName: agent.name,
        message,
        response,
        conversationId,
        timestamp: new Date().toISOString(),
      });

      // Also broadcast to other connected users
      socket.broadcast.emit('message-broadcast', {
        agentId,
        agentName: agent.name,
        message,
        response,
        userId: socket.id,
        timestamp: new Date().toISOString(),
      });
    }, 1500);
  });

  // Handle typing indicator
  socket.on('typing', (data) => {
    socket.broadcast.emit('user-typing', {
      userId: socket.id,
      ...data,
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`👋 User disconnected: ${socket.id}`);
    io.emit('user-offline', { userId: socket.id });
  });

  // Error handling
  socket.on('error', (error) => {
    console.error(`❌ Socket error: ${error}`);
  });
});

// Error handling middleware
app.use((err: any, req: Request, res: Response) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred',
  });
});

// Start Server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  🍃 NARUTO AI ADVISOR - BACKEND 🍃    ║');
  console.log('╚════════════════════════════════════════╝\n');
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`🥷 Ninja mentors ready: ${agents.length}`);
  console.log(`⚡ WebSocket: Enabled`);
  console.log(`🔐 Security: Enabled (Helmet + Rate Limiting)`);
  console.log(`📍 CORS Origin: ${process.env.CORS_ORIGIN || 'All origins'}`);
  console.log('\n🚀 Ready to serve the Hidden Leaf Village!\n');
});

export { app, io, httpServer };
