"use client";

import { useState } from "react";
import { login, signup } from "@/app/actions/auth";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const action = mode === "login" ? login : signup;
    const result = await action(formData);
    if (result?.error) {
      setError(result.error);
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-white">
      <h1 className="text-2xl font-bold mb-8">筋トレメニュー</h1>

      <form action={handleSubmit} className="w-full max-w-xs space-y-4">
        <div>
          <input
            name="email"
            type="email"
            placeholder="メールアドレス"
            required
            className={`w-full px-4 py-2.5 rounded-full bg-gray-100 border text-base outline-none ${
              error ? "border-red-400" : "border-gray-300"
            }`}
          />
        </div>
        <div>
          <input
            name="password"
            type="password"
            placeholder="パスワード"
            required
            minLength={6}
            className={`w-full px-4 py-2.5 rounded-full bg-gray-100 border text-base outline-none ${
              error ? "border-red-400" : "border-gray-300"
            }`}
          />
        </div>

        {error && (
          <p className="text-red-500 text-sm text-center">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-full bg-gray-800 text-white text-base font-bold disabled:opacity-50"
        >
          {loading
            ? mode === "login"
              ? "ログイン中..."
              : "登録中..."
            : mode === "login"
            ? "ログイン"
            : "新規登録"}
        </button>
      </form>

      <button
        onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}
        className="mt-6 text-sm text-gray-600 underline"
      >
        {mode === "login" ? "アカウントを作成する" : "ログインに戻る"}
      </button>
    </div>
  );
}
