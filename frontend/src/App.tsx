import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Home } from './pages/Home';
import { MissionDetail } from './pages/MissionDetail';

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-center min-h-screen bg-gray-950">
      {/* Phone frame on desktop */}
      <div className="w-full max-w-[430px] relative flex flex-col min-h-screen bg-[#0f0a1a] overflow-hidden shadow-2xl">
        {children}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/mission/:id" element={<MissionDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
