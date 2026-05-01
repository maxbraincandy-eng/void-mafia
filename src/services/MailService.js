const nodemailer = require("nodemailer");

function configured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function transport() {
  if (!configured()) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendVerificationCode(email, code) {
  const t = transport();
  if (!t) {
    console.log(`SMTP not configured. Code for ${email}: ${code}`);
    return { ok: true, devCode: code };
  }

  await t.sendMail({
    from: process.env.MAIL_FROM || `VOID MAFIA <${process.env.SMTP_USER}>`,
    to: email,
    subject: "VOID MAFIA verification",
    text: `VOID MAFIA verification code: ${code}`,
    html: `<div style="background:#07020f;color:white;padding:26px;font-family:Arial">
      <h2 style="color:#00f5ff">VOID MAFIA</h2>
      <p>Verification code:</p>
      <div style="font-size:34px;letter-spacing:8px;color:#ff00e6;font-weight:900">${code}</div>
      <p>This code expires soon.</p>
    </div>`
  });

  return { ok: true };
}

module.exports = { configured, sendVerificationCode };
