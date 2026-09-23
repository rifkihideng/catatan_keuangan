// Pengiriman email transaksional (tautan reset password & verifikasi email).
//
// Penyedia yang didukung: Resend (HTTP API, tanpa dependensi tambahan).
// Bila RESEND_API_KEY belum diisi, email TIDAK dikirim dan isinya dicetak ke
// log server — berguna untuk pengembangan lokal dan hosting mandiri
// (tautan reset bisa disalin langsung dari terminal).
//
// Variabel lingkungan:
//   RESEND_API_KEY  kunci API Resend
//   EMAIL_FROM      pengirim, mis. "Catatan Keuangan <no-reply@domainku.com>"
//   APP_NAME        nama aplikasi pada subjek & isi email (default: Catatan Keuangan)
//   PUBLIC_URL      URL publik aplikasi, mis. https://keuanganku.com

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export function appName() {
  return process.env.APP_NAME || 'Catatan Keuangan';
}

function emailFrom() {
  return process.env.EMAIL_FROM || `${appName()} <no-reply@localhost>`;
}

// Kirim satu email. Melempar Error bila penyedia menolak, supaya pemanggil bisa
// mencatatnya — tetapi pemanggil TIDAK boleh membocorkan detail ini ke klien.
export async function sendEmail({ to, subject, text, html }) {
  if (!emailConfigured()) {
    console.log('📧 [mode konsol] Email tidak dikirim (RESEND_API_KEY belum diisi).');
    console.log(`   Kepada  : ${to}`);
    console.log(`   Subjek  : ${subject}`);
    console.log(
      text
        .split('\n')
        .map((line) => `   ${line}`)
        .join('\n')
    );
    return { delivered: false, mode: 'console' };
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: emailFrom(), to: [to], subject, text, html }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend menolak permintaan (${res.status}): ${detail.slice(0, 300)}`);
  }
  return { delivered: true, mode: 'resend' };
}

// ---------------------------------------------------------------------------
// Templat email
// ---------------------------------------------------------------------------

function layout({ title, intro, buttonLabel, url, footer }) {
  return `<!doctype html>
<html lang="id"><body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1e293b">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px">
    <h1 style="margin:0 0 12px;font-size:20px">${title}</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569">${intro}</p>
    <p style="margin:0 0 24px">
      <a href="${url}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:12px">${buttonLabel}</a>
    </p>
    <p style="margin:0 0 8px;font-size:12px;color:#64748b">Atau salin tautan berikut ke browser:</p>
    <p style="margin:0 0 24px;font-size:12px;word-break:break-all;color:#4f46e5">${url}</p>
    <p style="margin:0;font-size:12px;color:#94a3b8">${footer}</p>
  </div>
</body></html>`;
}

export function resetPasswordEmail({ url, expiresMinutes }) {
  return {
    subject: `Reset password ${appName()}`,
    text: `Seseorang meminta pengaturan ulang password akun ${appName()} kamu.

Buka tautan berikut untuk membuat password baru:
${url}

Tautan berlaku ${expiresMinutes} menit dan hanya bisa dipakai sekali.
Kalau kamu tidak meminta ini, abaikan saja email ini — password kamu tidak berubah.`,
    html: layout({
      title: 'Reset password',
      intro: `Kami menerima permintaan pengaturan ulang password untuk akun ${appName()} kamu. Klik tombol di bawah untuk membuat password baru.`,
      buttonLabel: 'Buat password baru',
      url,
      footer: `Tautan berlaku ${expiresMinutes} menit dan hanya bisa dipakai sekali. Kalau kamu tidak meminta ini, abaikan saja email ini.`,
    }),
  };
}

export function verifyEmailEmail({ url, expiresHours }) {
  return {
    subject: `Konfirmasi email ${appName()}`,
    text: `Terima kasih sudah mendaftar di ${appName()}.

Konfirmasi alamat email kamu dengan membuka tautan berikut:
${url}

Tautan berlaku ${expiresHours} jam.`,
    html: layout({
      title: 'Konfirmasi email',
      intro: `Terima kasih sudah mendaftar di ${appName()}. Konfirmasi alamat email kamu dengan menekan tombol di bawah.`,
      buttonLabel: 'Konfirmasi email',
      url,
      footer: `Tautan berlaku ${expiresHours} jam.`,
    }),
  };
}
