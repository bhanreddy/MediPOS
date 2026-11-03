import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, Moon, ShieldCheck, Sun } from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
import "../../styles/login.css";

export function LoginExperience({ children, recovery = false }: { children: ReactNode; recovery?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveImage((current) => (current + 1) % 2);
    }, 2000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <main className="login-workspace">
      <section className="login-story" aria-label="Nexsyrus pharmacy workspace">
        <div className="login-brand"><span className="login-brand-mark" aria-hidden="true">✚</span>Nexsyrus</div>
        <div className="login-story-content">
          <span className="login-eyebrow">CARE STARTS HERE</span>
          <h1>Your pharmacy.<br /><span>In good hands.</span></h1>
          <p>Billing, stock, and everyday care. Together.</p>
          <div className="login-illustration" aria-hidden="true">
            <div className={`login-slide${activeImage === 0 ? " is-active" : ""}`}>
              <img className="login-pharmacist" src="/images/login-pharmacist-realistic.png" alt="" width="1122" height="1402" fetchPriority="high" decoding="async" draggable={false} />
              <img className="login-medical-accent" src="/images/login-medical-products-realistic.png" alt="" width="1254" height="1254" decoding="async" draggable={false} />
            </div>
            <div className={`login-slide${activeImage === 1 ? " is-active" : ""}`}>
              <img className="login-products" src="/images/login-medical-products-realistic.png" alt="" width="1254" height="1254" decoding="async" draggable={false} />
            </div>
          </div>
        </div>
        <div className="login-story-footer"><span>MADE FOR YOUR EVERYDAY CARE</span><ArrowUpRight size={18} aria-hidden="true" /></div>
      </section>
      <section className="login-entry" aria-labelledby="login-heading">
        <div className="login-entry-top"><span><ShieldCheck size={15} aria-hidden="true" /> Secure workspace</span><button type="button" className="login-theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button></div>
        <div className="login-form-wrap">
          <h2 id="login-heading">{recovery ? "Reset your password" : "Welcome back"}</h2>
          <p className="login-description">{recovery ? "Choose a new password for your account." : "Sign in to your pharmacy workspace."}</p>
          {children}
        </div>
        <footer className="login-entry-footer"><ShieldCheck size={15} aria-hidden="true" /><span>Your pharmacy. Connected.</span></footer>
      </section>
    </main>
  );
}
