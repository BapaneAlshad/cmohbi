import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Pendaftaran mandiri dinonaktifkan. Akun dibuat oleh Super Admin melalui Manajemen User." }, { status: 403 });
}
