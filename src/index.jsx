import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom/client'
import { 
  ThemeProvider, 
  createTheme, 
  CssBaseline,
  Box,
  TextField,
  Button,
  Typography,
  Container,
  Paper,
  IconButton,
  CircularProgress,
  Alert
} from '@mui/material'
import { Terminal as TerminalIcon, Logout, Login } from '@mui/icons-material'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#8ab4f8' },
    background: {
      default: '#0d1117',
      paper: '#161b22',
    },
  },
  typography: {
    fontFamily: '"Inter", sans-serif',
    button: { textTransform: 'none' },
  },
  shape: { borderRadius: 12 },
})

const getWebSocketUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.hostname
  const port = '3000'
  return `${protocol}//${host}:${port}`
}

const LoginScreen = ({ onLogin, error, loading }) => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  return (
    <Container maxWidth="xs" sx={{ height: '100vh', display: 'flex', alignItems: 'center' }}>
      <Paper elevation={0} sx={{ p: 4, width: '100%' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
          <TerminalIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
          <Typography variant="h5">jsssh</Typography>
        </Box>

        <form onSubmit={(e) => { e.preventDefault(); onLogin(username, password) }}>
          <TextField fullWidth margin="normal" label="Логин" value={username} onChange={(e) => setUsername(e.target.value)} disabled={loading} autoFocus />
          <TextField fullWidth margin="normal" label="Пароль" type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} sx={{ mb: 3 }} />

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Button type="submit" fullWidth variant="contained" size="large" disabled={loading} startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <Login />}>
            {loading ? 'Вход...' : 'Войти'}
          </Button>
        </form>
      </Paper>
    </Container>
  )
}

const TerminalScreen = ({ onLogout }) => {
  const terminalRef = useRef(null)
  const wsRef = useRef(null)

  useEffect(() => {
    if (!terminalRef.current) return

    const term = new Terminal({
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 14,
      cursorBlink: true,
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#c9d1d9',
        selectionBackground: '#264f78',
        black: '#0d1117',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#c9d1d9',
      },
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(terminalRef.current)
    
    setTimeout(() => {
      fitAddon.fit()
      term.focus()
    }, 50)

    const ws = new WebSocket(getWebSocketUrl())
    wsRef.current = ws

    ws.onopen = () => {
      const dims = fitAddon.proposeDimensions()
      if (dims) {
        ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }))
      }
    }

    ws.onmessage = (e) => term.write(e.data)

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data }))
      }
    })

    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }))
      }
    })

    const handleResize = () => {
      fitAddon.fit()
      const dims = fitAddon.proposeDimensions()
      if (dims && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }))
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      ws.close()
      term.dispose()
    }
  }, [])

  return (
    <Box sx={{ height: '100vh', bgcolor: '#0d1117', overflow: 'hidden' }}>
      <Box sx={{ position: 'fixed', top: 8, right: 8, zIndex: 1000 }}>
        <IconButton onClick={onLogout} size="small" sx={{ color: 'text.secondary' }}>
          <Logout fontSize="small" />
        </IconButton>
      </Box>
      <Box 
        ref={terminalRef} 
        sx={{ 
          height: '100%',
          width: '100%',
          '& .xterm-viewport': {
            overflowY: 'hidden !important',
          },
          '& .xterm-screen': {
            width: '100% !important',
          }
        }} 
      />
    </Box>
  )
}

const App = () => {
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loginLoading, setLoginLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/check-auth')
      .then(res => res.json())
      .then(data => setAuthenticated(data.authenticated))
      .finally(() => setLoading(false))
  }, [])

  const handleLogin = async (username, password) => {
    setError('')
    setLoginLoading(true)
    
    try {
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const data = await res.json()
      
      if (data.success) {
        setAuthenticated(true)
      } else {
        setError('Неверные данные')
      }
    } catch {
      setError('Ошибка соединения')
    } finally {
      setLoginLoading(false)
    }
  }

  const handleLogout = async () => {
    await fetch('/logout', { method: 'POST' })
    setAuthenticated(false)
  }

  if (loading) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {authenticated ? (
        <TerminalScreen onLogout={handleLogout} />
      ) : (
        <LoginScreen onLogin={handleLogin} error={error} loading={loginLoading} />
      )}
    </ThemeProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />)