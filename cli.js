#!/usr/bin/env node
/**
 * MBCPOS — CLI User Management Tool
 *
 * Usage:
 *   node cli.js list
 *   node cli.js passwd <username> <newpassword>
 *   node cli.js rename <username> <newusername>
 *   node cli.js role   <username> <admin|cashier|accountant>
 *   node cli.js add    <username> <password> [role] [fullname]
 *   node cli.js remove <username>
 *   node cli.js activate   <username>
 *   node cli.js deactivate <username>
 *
 * Examples:
 *   node cli.js passwd  admin    MyNewPass123
 *   node cli.js rename  cashier  jdelacruz
 *   node cli.js role    cashier  accountant
 *   node cli.js add     mary     pass123 cashier "Mary Santos"
 *   node cli.js remove  olduser
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR   = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const VALID_ROLES = ['admin', 'cashier', 'accountant'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function readUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    console.error('ERROR: users.json not found at', USERS_FILE);
    console.error('       Make sure you run this from the pos-system directory.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function findUser(users, username) {
  const u = users.find(u => u.username === username);
  if (!u) { console.error(`ERROR: User "${username}" not found.`); process.exit(1); }
  return u;
}

function print(msg)  { console.log(msg); }
function ok(msg)     { console.log('\x1b[32m✔\x1b[0m  ' + msg); }
function fail(msg)   { console.error('\x1b[31m✖\x1b[0m  ' + msg); process.exit(1); }

function printTable(users) {
  const pad = (s, n) => String(s||'').padEnd(n);
  const line = '─'.repeat(72);
  print('\n' + line);
  print(
    pad('USERNAME',  16) +
    pad('FULL NAME', 22) +
    pad('ROLE',      14) +
    pad('STATUS',    10) +
    'CREATED'
  );
  print(line);
  users.forEach(u => {
    const status = u.isActive ? '\x1b[32mActive\x1b[0m' : '\x1b[31mInactive\x1b[0m';
    print(
      pad(u.username,  16) +
      pad(u.fullName || '—', 22) +
      pad(u.role,      14) +
      pad(status,      17) +
      new Date(u.createdAt).toLocaleDateString()
    );
  });
  print(line + '\n');
}

// ── Commands ─────────────────────────────────────────────────────────────────

const commands = {

  list() {
    const users = readUsers();
    print(`\nMBCPOS Users (${users.length} total)`);
    printTable(users);
  },

  async passwd(username, newpass) {
    if (!username || !newpass) fail('Usage: node cli.js passwd <username> <newpassword>');
    if (newpass.length < 4)    fail('Password must be at least 4 characters.');
    const users = readUsers();
    const u = findUser(users, username);
    u.password    = await bcrypt.hash(newpass, 10);
    u.updatedAt   = new Date().toISOString();
    writeUsers(users);
    ok(`Password updated for user "${username}".`);
  },

  rename(username, newusername) {
    if (!username || !newusername) fail('Usage: node cli.js rename <username> <newusername>');
    if (!/^[a-zA-Z0-9_.-]+$/.test(newusername)) fail('New username may only contain letters, numbers, _ . -');
    const users = readUsers();
    findUser(users, username);
    if (users.find(u => u.username === newusername)) fail(`Username "${newusername}" is already taken.`);
    const u     = users.find(u => u.username === username);
    const oldUN = u.username;
    u.username  = newusername;
    u.updatedAt = new Date().toISOString();
    writeUsers(users);
    ok(`Renamed "${oldUN}" → "${newusername}".`);
  },

  role(username, role) {
    if (!username || !role) fail('Usage: node cli.js role <username> <admin|cashier|accountant>');
    if (!VALID_ROLES.includes(role)) fail(`Invalid role "${role}". Valid roles: ${VALID_ROLES.join(', ')}`);
    const users = readUsers();
    const u = findUser(users, username);
    // Guard: cannot demote last admin
    if (u.role === 'admin' && role !== 'admin') {
      const adminCount = users.filter(x => x.role === 'admin' && x.isActive).length;
      if (adminCount <= 1) fail('Cannot change role of the last admin account.');
    }
    u.role      = role;
    u.updatedAt = new Date().toISOString();
    writeUsers(users);
    ok(`Role for "${username}" set to "${role}".`);
  },

  async add(username, password, role = 'cashier', fullName) {
    if (!username || !password) fail('Usage: node cli.js add <username> <password> [role] [fullname]');
    if (!VALID_ROLES.includes(role)) fail(`Invalid role "${role}". Valid roles: ${VALID_ROLES.join(', ')}`);
    if (password.length < 4) fail('Password must be at least 4 characters.');
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) fail('Username may only contain letters, numbers, _ . -');
    const users = readUsers();
    if (users.find(u => u.username === username)) fail(`Username "${username}" already exists.`);
    const newUser = {
      id:        uuidv4(),
      username,
      password:  await bcrypt.hash(password, 10),
      fullName:  fullName || username,
      role,
      isActive:  true,
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    writeUsers(users);
    ok(`User "${username}" created with role "${role}".`);
  },

  remove(username) {
    if (!username) fail('Usage: node cli.js remove <username>');
    const users = readUsers();
    const u = findUser(users, username);
    if (u.role === 'admin') {
      const adminCount = users.filter(x => x.role === 'admin' && x.isActive).length;
      if (adminCount <= 1) fail('Cannot delete the last admin account.');
    }
    const idx = users.findIndex(x => x.username === username);
    users.splice(idx, 1);
    writeUsers(users);
    ok(`User "${username}" deleted.`);
  },

  activate(username) {
    if (!username) fail('Usage: node cli.js activate <username>');
    const users = readUsers();
    const u = findUser(users, username);
    u.isActive  = true;
    u.updatedAt = new Date().toISOString();
    writeUsers(users);
    ok(`User "${username}" is now Active.`);
  },

  deactivate(username) {
    if (!username) fail('Usage: node cli.js deactivate <username>');
    const users = readUsers();
    const u = findUser(users, username);
    if (u.role === 'admin') {
      const activeAdmins = users.filter(x => x.role === 'admin' && x.isActive).length;
      if (activeAdmins <= 1) fail('Cannot deactivate the last active admin account.');
    }
    u.isActive  = false;
    u.updatedAt = new Date().toISOString();
    writeUsers(users);
    ok(`User "${username}" is now Inactive.`);
  }
};

// ── Help ─────────────────────────────────────────────────────────────────────

function printHelp() {
  print(`
\x1b[1mMBCPOS CLI — User Management\x1b[0m

\x1b[33mUsage:\x1b[0m  node cli.js <command> [arguments]

\x1b[33mCommands:\x1b[0m
  list                               List all users
  passwd  <username> <newpassword>   Change a user's password
  rename  <username> <newusername>   Change a user's username
  role    <username> <role>          Change a user's role (admin|cashier|accountant)
  add     <username> <password>      Create a new user
              [role] [fullname]        Optional: role (default: cashier), full name
  remove  <username>                 Delete a user
  activate   <username>              Set user as active
  deactivate <username>              Set user as inactive

\x1b[33mExamples:\x1b[0m
  node cli.js list
  node cli.js passwd  admin    NewSecurePass!
  node cli.js rename  cashier  jdelacruz
  node cli.js role    jdelacruz  accountant
  node cli.js add     mary     pass1234 cashier "Mary Santos"
  node cli.js remove  olduser
`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const [,, cmd, ...args] = process.argv;

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printHelp();
    process.exit(0);
  }

  const handler = commands[cmd];
  if (!handler) {
    console.error(`\x1b[31mUnknown command: "${cmd}"\x1b[0m`);
    printHelp();
    process.exit(1);
  }

  try {
    await handler(...args);
  } catch(err) {
    console.error('\x1b[31mError:\x1b[0m', err.message);
    process.exit(1);
  }
})();
