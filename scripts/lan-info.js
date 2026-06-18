const os = require("os");
const { execSync } = require("child_process");

function getLanIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push({ name, ip: iface.address });
      }
    }
  }
  return ips;
}

const ips = getLanIPs();
const port = process.env.PORT || 3000;

console.log("");
console.log("  \x1b[35m╔══════════════════════════════════════╗\x1b[0m");
console.log("  \x1b[35m║\x1b[0m   \x1b[33m忆见 Memory AI — 局域网访问\x1b[0m     \x1b[35m║\x1b[0m");
console.log("  \x1b[35m╚══════════════════════════════════════╝\x1b[0m");
console.log("");

if (ips.length === 0) {
  console.log("  \x1b[31m⚠ 未检测到局域网 IP，请检查网络连接\x1b[0m");
} else {
  // Filter out APIPA (169.254.x.x) — those are auto-configured, not real LAN
  const realIPs = ips.filter(({ ip }) => !ip.startsWith("169.254."));
  const apipaIPs = ips.filter(({ ip }) => ip.startsWith("169.254."));

  if (realIPs.length > 0) {
    console.log("  \x1b[36m📱 手机端请访问以下地址：\x1b[0m");
    console.log("");
    for (const { name, ip } of realIPs) {
      console.log("     \x1b[32m➜\x1b[0m  http://" + ip + ":" + port);
      console.log("        (" + name + ")");
    }
  }

  if (apipaIPs.length > 0 && realIPs.length === 0) {
    console.log("  \x1b[33m⚠ 仅检测到自动配置 IP (APIPA)，请确保设备在同一网络\x1b[0m");
    for (const { name, ip } of apipaIPs) {
      console.log("     \x1b[90m  http://" + ip + ":" + port + " (可能不可用)\x1b[0m");
    }
  }
}

console.log("");
console.log("  \x1b[90m💻 本机访问：http://localhost:" + port + "\x1b[0m");
console.log("");
console.log("  \x1b[90m防火墙提示：\x1b[0m");
console.log("  \x1b[90m  Windows: 首次运行需允许 Node.js 访问专用网络\x1b[0m");
console.log("  \x1b[90m  或手动: netsh advfirewall firewall add rule name=\"Node3000\" dir=in action=allow protocol=TCP localport=3000\x1b[0m");
console.log("");
console.log("  \x1b[90m按 Ctrl+C 停止服务器\x1b[0m");
console.log("");
