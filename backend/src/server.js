// ============================================
// Server Entry Point
// ============================================
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║                                          ║
  ║   💰  PondoSync Server Running          ║
  ║                                          ║
  ║   Local:  http://localhost:${PORT}          ║
  ║   Mode:   ${process.env.NODE_ENV || 'development'}                   ║
  ║                                          ║
  ╚══════════════════════════════════════════╝
  `);
});
