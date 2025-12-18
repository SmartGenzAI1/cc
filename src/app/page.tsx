'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Sidebar } from '@/components/Sidebar';
import { ChatArea } from '@/components/ChatArea';
import { Shield, Sparkles, Zap, TrendingUp, Trophy, MessageSquare, Fingerprint, Globe, Lock, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { useMetrics } from '@/hooks/useMetrics';

export default function Home() {
  const { user, loading } = useAuth();
  useMetrics(); // Initialize tracking
  const router = useRouter();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [pulseIndex, setPulseIndex] = useState(0);
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('id', user?.id).single();
    if (data) {
      setProfile(data);
      if (!data.has_completed_onboarding) {
        setOnboardingStep(0);
      }
    }
  };

  const completeOnboarding = async () => {
    await supabase.from('profiles').update({ has_completed_onboarding: true }).eq('id', user?.id);
    setOnboardingStep(null);
  };

  const onboardingScreens = [
    {
      title: "PRIVACY FIRST",
      description: "Everything you say is end-to-end encrypted. We use AES-256 vaulting at the edge to ensure your data never leaves your control.",
      icon: <Shield className="h-20 w-20 text-blue-500" />,
      color: "from-blue-500/20"
    },
    {
      title: "TEXT AT VELOCITY",
      description: "Experience a distraction-free environment optimized for high-speed professional communication. Fast, clean, and reliable.",
      icon: <Zap className="h-20 w-20 text-purple-500" />,
      color: "from-purple-500/20"
    },
    {
      title: "SYNCED IDENTITY",
      description: "Your identity is yours to manage. Minimal data required, maximum control over how others see you.",
      icon: <Fingerprint className="h-20 w-20 text-white" />,
      color: "from-white/10"
    }
  ];

  const pulseMessages = [
    "Secure tunnel established in #encryption",
    "Global sync completed in 12ms",
    "Lucky match active in #gaming",
    "Vault integrity: 100%",
    "782 nodes online"
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setPulseIndex((prev) => (prev + 1) % pulseMessages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (selectedRoomId && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }, [selectedRoomId]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground transition-colors duration-500">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center"
        >
          <Shield className="h-6 w-6 text-primary" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground selection:bg-primary selection:text-primary-foreground transition-colors duration-500">
      <div className={`${isSidebarOpen ? 'flex' : 'hidden'} md:flex h-full w-full md:w-[420px] border-r border-border z-30 bg-background/50 backdrop-blur-3xl`}>
        <Sidebar 
          onSelectRoom={setSelectedRoomId} 
          selectedRoomId={selectedRoomId} 
        />
      </div>
      
      <div className={`${!isSidebarOpen || selectedRoomId ? 'flex' : 'hidden'} md:flex flex-1 h-full relative overflow-hidden bg-background`}>
        {/* Advanced Mesh Background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-50 dark:opacity-100">
          <div className="absolute top-[-20%] left-[-10%] w-[80%] h-[80%] bg-blue-600/10 rounded-full blur-[180px] animate-pulse" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[80%] h-[80%] bg-purple-700/10 rounded-full blur-[180px] animate-pulse" style={{ animationDelay: '3s' }} />
          <div className="absolute top-[20%] right-[20%] w-[40%] h-[40%] bg-emerald-500/5 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '1.5s' }} />
          <div className="absolute top-[40%] left-[30%] w-[30%] h-[30%] bg-foreground/[0.02] rounded-full blur-[100px]" />
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.05] brightness-125 contrast-150 mix-blend-overlay" />
        </div>

        {onboardingStep !== null ? (
          <div className="flex flex-1 flex-col items-center justify-center relative z-10 p-8 md:p-20 overflow-y-auto bg-background/80 backdrop-blur-sm">
            <AnimatePresence mode="wait">
              <motion.div 
                key={onboardingStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-xl w-full text-center space-y-12"
              >
                <div className={`mx-auto w-40 h-40 rounded-[40px] bg-gradient-to-br ${onboardingScreens[onboardingStep].color} to-transparent border border-foreground/10 flex items-center justify-center shadow-2xl mb-8`}>
                  {onboardingScreens[onboardingStep].icon}
                </div>
                
                <div className="space-y-4">
                  <h2 className="text-5xl font-black italic tracking-tighter uppercase text-foreground">{onboardingScreens[onboardingStep].title}</h2>
                  <p className="text-lg text-muted-foreground font-medium leading-relaxed">{onboardingScreens[onboardingStep].description}</p>
                </div>

                <div className="flex flex-col gap-4 pt-8">
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      if (onboardingStep < onboardingScreens.length - 1) {
                        setOnboardingStep(onboardingStep + 1);
                      } else {
                        completeOnboarding();
                      }
                    }}
                    className="px-10 py-5 rounded-full bg-foreground text-background font-black text-sm uppercase tracking-[0.2em] shadow-xl transition-all"
                  >
                    {onboardingStep < onboardingScreens.length - 1 ? "Next Synchronization" : "Enter Chat List"}
                  </motion.button>
                  
                  <div className="flex justify-center gap-2">
                    {onboardingScreens.map((_, i) => (
                      <div key={i} className={`h-1 w-8 rounded-full transition-all ${i === onboardingStep ? 'bg-primary' : 'bg-foreground/10'}`} />
                    ))}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        ) : selectedRoomId ? (
          <ChatArea 
            roomId={selectedRoomId} 
            onBack={() => {
              setSelectedRoomId(null);
              setIsSidebarOpen(true);
            }}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center relative z-10 p-8 md:p-20 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="text-center max-w-5xl w-full space-y-16"
            >
              <div className="space-y-6">
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/5 border border-accent/10 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-8"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/40 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                  {pulseMessages[pulseIndex]}
                </motion.div>
                
                <h2 className="text-8xl md:text-[120px] font-black tracking-tighter leading-none mb-4 italic bg-gradient-to-b from-foreground to-foreground/40 bg-clip-text text-transparent">
                  AURA
                </h2>
                
                <p className="text-xl text-muted-foreground max-w-xl mx-auto font-medium tracking-tight leading-relaxed">
                  Experience the next generation of social connectivity. Private, gamified, and lightning fast.
                </p>
              </div>

              {/* Bento Grid Features */}
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4 text-left">
                <motion.div 
                  whileHover={{ y: -5 }}
                  className="md:col-span-3 p-8 rounded-[40px] bg-accent/5 border border-accent/10 backdrop-blur-2xl group transition-all relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Fingerprint className="h-32 w-32" />
                  </div>
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <Lock className="h-6 w-6" />
                  </div>
                  <h3 className="text-2xl font-black mb-2 tracking-tight text-foreground">End-to-End Vault</h3>
                  <p className="text-sm text-muted-foreground font-medium leading-relaxed max-w-[200px]">Your messages are yours alone. AES-256 encryption at the edge.</p>
                </motion.div>

                <motion.div 
                  whileHover={{ y: -5 }}
                  className="md:col-span-3 p-8 rounded-[40px] bg-accent/5 border border-accent/10 backdrop-blur-2xl group transition-all"
                >
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <Zap className="h-6 w-6" />
                  </div>
                  <h3 className="text-2xl font-black mb-2 tracking-tight text-foreground">Real-time Pulse</h3>
                  <p className="text-sm text-muted-foreground font-medium leading-relaxed max-w-[200px]">Global synchronization with zero latency. Feel every interaction.</p>
                  <div className="mt-8 h-1 w-full bg-accent/10 rounded-full overflow-hidden">
                    <motion.div 
                      animate={{ width: ['0%', '100%'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="h-full bg-gradient-to-r from-transparent via-primary to-transparent"
                    />
                  </div>
                </motion.div>

                <motion.div 
                  whileHover={{ y: -5 }}
                  className="md:col-span-2 p-8 rounded-[40px] bg-accent/5 border border-accent/10 backdrop-blur-2xl group transition-all"
                >
                  <div className="h-12 w-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-6">
                    <Trophy className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-black mb-1 tracking-tight text-foreground">Level Up</h3>
                  <p className="text-xs text-muted-foreground font-medium leading-relaxed">Earn AP for every message and unlock status.</p>
                </motion.div>

                <motion.div 
                  whileHover={{ y: -5 }}
                  className="md:col-span-2 p-8 rounded-[40px] bg-accent/5 border border-accent/10 backdrop-blur-2xl group transition-all"
                >
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6">
                    <Globe className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-black mb-1 tracking-tight text-foreground">Global Reach</h3>
                  <p className="text-xs text-muted-foreground font-medium leading-relaxed">Connect with users across 40+ global edge nodes.</p>
                </motion.div>

                <motion.div 
                  whileHover={{ y: -5 }}
                  className="md:col-span-2 p-8 rounded-[40px] bg-accent/5 border border-accent/10 backdrop-blur-2xl group transition-all"
                >
                  <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-6">
                    <Cpu className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-black mb-1 tracking-tight text-foreground">AI Driven</h3>
                  <p className="text-xs text-muted-foreground font-medium leading-relaxed">Smart suggestions and automated moderation.</p>
                </motion.div>
              </div>

              <div className="pt-12">
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setIsSidebarOpen(true)}
                  className="px-10 py-5 rounded-full bg-primary text-primary-foreground font-black text-sm uppercase tracking-[0.2em] shadow-2xl hover:shadow-primary/20 transition-all"
                >
                  Initialize Aura
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
