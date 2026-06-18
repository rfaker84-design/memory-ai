import Link from "next/link";

export default function Footer() {
  return (
    <footer style={{
      borderTop: "1px solid rgba(180,160,140,0.15)",
      background: "rgba(246,241,232,0.7)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      padding: "16px 20px calc(16px + env(safe-area-inset-bottom, 0px))",
      textAlign: "center",
    }}>
      <p style={{
        margin: 0, fontSize: 11, fontWeight: 300,
        color: "#8a8078", letterSpacing: "0.04em",
      }}>
        &copy; {new Date().getFullYear()} 忆见 MemoryAI
      </p>
      <p style={{
        margin: "4px 0 0", fontSize: 10, fontWeight: 300,
        color: "#a09890", letterSpacing: "0.03em",
      }}>
        <a
          href="https://beian.miit.gov.cn/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "inherit", textDecoration: "none" }}
        >
          ICP备案号待填写
        </a>
      </p>
    </footer>
  );
}
