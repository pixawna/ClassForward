export default function Join() {
  return (
    <main className="mx-auto max-w-lg space-y-6 p-10">
      <h1 className="font-serif text-4xl">Join your classroom</h1>
      <form action="/quiz/join" className="space-y-4">
        <label>
          Room code
          <input
            name="code"
            required
            maxLength={8}
            pattern="[A-Fa-f0-9]{8}"
            className="block w-full rounded-xl border p-4 uppercase"
          />
        </label>
        <button className="rounded-full border-2 bg-white px-6 py-3">
          Join room
        </button>
      </form>
    </main>
  );
}
