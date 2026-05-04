// ============================================
// Admin Authentication Middleware
// Restricts access to users with 'admin' role
// Must be used AFTER the auth middleware
// ============================================

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: 'Admin access required.' 
    });
  }
  next();
}

module.exports = adminOnly;
