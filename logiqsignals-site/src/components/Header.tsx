import logo from '../assets/goldlion.png';

export default function Header() {
  return (
    <header className="w-full flex items-center justify-center py-6">
      <div className="flex items-center gap-3">
        <Logo size={80} />
        <div className="flex flex-col">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-emerald-300 drop-shadow">
            LogiQ Dominicus Signals 2035
          </h1>
          <span className="text-emerald-200/70 text-sm">LogiQ Lion</span>
        </div>
      </div>
    </header>
  );
}
