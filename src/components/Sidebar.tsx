'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { 
  Plus, 
  Search, 
  LogOut, 
  Settings as SettingsIcon, 
  Bell, 
  Shield, 
  User, 
  Bookmark,
  Sparkles,
  Hash,
  Zap,
  Pin,
  VolumeX,
  Archive,
  Trash2,
  Volume2,
  Filter,
  MessageSquare,
  Users,
  Calendar,
  Clock,
  Eye,
  EyeOff,
  Link as LinkIcon,
  HelpCircle,
  Info,
  Mail,
  ShieldAlert,
  ChevronRight,
  MessageCircle,
  Ghost,
  MoreHorizontal,
  UserCircle,
  ArrowLeft,
  Share2,
  Lock,
  CheckCircle2,
  Type,
  Contrast,
  Sun,
  Moon,
  Monitor,
  Palette
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  ContextMenu, 
  ContextMenuContent, 
  ContextMenuItem, 
  ContextMenuTrigger 
} from '@/components/ui/context-menu';
import { toast } from 'sonner';
import { formatDistanceToNow, isSameDay, format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';

type Room = {
  id: string;
  name: string;
  is_group: boolean;
  is_saved_messages?: boolean;
  is_pinned?: boolean;
  is_muted?: boolean;
  is_archived?: boolean;
  last_message?: {
    content: string;
    created_at: string;
  };
  unread_count?: number;
  other_user?: {
    id: string;
    username: string;
    avatar_url: string;
    status: string;
    last_seen: string;
  };
};

type SidebarProps = {
  onSelectRoom: (id: string) => void;
  selectedRoomId: string | null;
};

export function Sidebar({ onSelectRoom, selectedRoomId }: SidebarProps) {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [activeSection, setActiveSection] = useState<'chats' | 'anonymous' | 'more' | 'settings'>('chats');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalResults, setGlobalResults] = useState<{messages: any[], users: any[], links: any[]}>({ messages: [], users: [], links: [] });
  const [isSearching, setIsSearching] = useState(false);

  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  
  // Anonymous matching state
  const [isMatching, setIsMatching] = useState(false);
  
  // UX Settings
  const [settings, setSettings] = useState({ 
    soundEnabled: true, 
    animationsEnabled: true,
    readReceipts: true,
    showOnlineStatus: true,
    messageRetention: 'forever',
    quietHours: false,
    fontSize: 'medium',
    highContrast: false,
    accentColor: '#3b82f6'
  });

  const [activeTab, setActiveTab] = useState<'chats' | 'groups' | 'saved'>('chats');
  const [filterMode, setFilterMode] = useState<'all' | 'unread' | 'groups' | 'saved'>('all');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchProfile = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('id', user?.id).single();
    if (data) {
      setProfile(data);
      const dbSettings = {
        accentColor: data.accent_color || '#3b82f6'
      };
      setSettings(prev => ({ ...prev, ...dbSettings }));
      if (data.theme_preference) setTheme(data.theme_preference);
      applyAccessibility({ ...settings, ...dbSettings });
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('aura-settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      setSettings(prev => ({ ...prev, ...parsed }));
      applyAccessibility(parsed);
    }
  }, []);

  const applyAccessibility = (s: any) => {
    if (s.highContrast) document.documentElement.classList.add('high-contrast');
    else document.documentElement.classList.remove('high-contrast');
    
    const sizes: any = { small: '14px', medium: '16px', large: '18px' };
    document.documentElement.style.fontSize = sizes[s.fontSize || 'medium'];

    if (s.accentColor) {
      document.documentElement.style.setProperty('--accent-color', s.accentColor);
    }
  };

  const updateSettings = async (updates: any) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    localStorage.setItem('aura-settings', JSON.stringify(newSettings));
    applyAccessibility(newSettings);

    if (user && (updates.theme || updates.accentColor)) {
      await supabase.from('profiles').update({
        theme_preference: updates.theme || theme,
        accent_color: updates.accentColor || newSettings.accentColor
      }).eq('id', user.id);
      if (updates.theme) setTheme(updates.theme);
    }

    toast.success('Preferences synchronized');
  };

  const handleTogglePin = async (roomId: string, currentStatus: boolean) => {
    await supabase.from('room_members').update({ is_pinned: !currentStatus }).eq('room_id', roomId).eq('user_id', user?.id);
    fetchRooms();
  };

  const handleToggleMute = async (roomId: string, currentStatus: boolean) => {
    await supabase.from('room_members').update({ is_muted: !currentStatus }).eq('room_id', roomId).eq('user_id', user?.id);
    fetchRooms();
  };

  const handleArchive = async (roomId: string) => {
    await supabase.from('room_members').update({ is_archived: true }).eq('room_id', roomId).eq('user_id', user?.id);
    fetchRooms();
  };

  const handleDelete = async (roomId: string) => {
    await supabase.from('room_members').delete().eq('room_id', roomId).eq('user_id', user?.id);
    fetchRooms();
  };

  const filteredRooms = rooms.filter(room => {
    const matchesSearch = (room.is_saved_messages ? 'Saved Messages' : (room.name || room.other_user?.username || '')).toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filterMode === 'unread') return matchesSearch && (room.unread_count || 0) > 0;
    if (filterMode === 'groups') return matchesSearch && room.is_group;
    if (filterMode === 'saved') return matchesSearch && room.is_saved_messages;
    
    if (activeTab === 'saved') return matchesSearch && room.is_saved_messages;
    if (activeTab === 'groups') return matchesSearch && room.is_group;
    return matchesSearch && !room.is_saved_messages && !room.is_group;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setGlobalSearchOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        setIsNewChatOpen(true);
      }
      
      if (e.key === 'ArrowDown' && activeSection === 'chats' && !globalSearchOpen && document.activeElement !== searchInputRef.current) {
        setFocusedIndex(prev => Math.min(prev + 1, filteredRooms.length - 1));
      }
      if (e.key === 'ArrowUp' && activeSection === 'chats' && !globalSearchOpen && document.activeElement !== searchInputRef.current) {
        setFocusedIndex(prev => Math.max(prev - 1, 0));
      }
      if (e.key === 'Enter' && focusedIndex >= 0 && !globalSearchOpen) {
        onSelectRoom(filteredRooms[focusedIndex].id);
      }
      if (e.key === 'Escape') {
        setFocusedIndex(-1);
        setGlobalSearchOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredRooms, focusedIndex, onSelectRoom, globalSearchOpen, activeSection]);

  const fetchRooms = async () => {
    const { data, error } = await supabase
      .from('room_members')
      .select(`
        room_id,
        last_read_at,
        is_pinned,
        is_muted,
        is_archived,
        rooms (
          id,
          name,
          is_group,
          is_saved_messages,
          messages (
            content,
            created_at
          )
        )
      `)
      .eq('user_id', user?.id)
      .eq('is_archived', activeTab === 'saved' ? true : false);

    if (error) return;

    const roomsData = await Promise.all(data.map(async (item: any) => {
      const room = item.rooms;
      const lastMsg = room.messages?.sort((a: any, b: any) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', room.id)
        .gt('created_at', item.last_read_at || new Date(0).toISOString())
        .neq('user_id', user?.id);

      if (!room.is_group && !room.is_saved_messages) {
        const { data: otherMember } = await supabase
          .from('room_members')
          .select(`profiles (*)`)
          .eq('room_id', room.id)
          .neq('user_id', user?.id)
          .single();
        
        return {
          ...room,
          last_message: lastMsg,
          unread_count: count || 0,
          is_pinned: item.is_pinned,
          is_muted: item.is_muted,
          is_archived: item.is_archived,
          other_user: (otherMember as any)?.profiles
        };
      }
      return { 
        ...room, 
        last_message: lastMsg, 
        unread_count: count || 0,
        is_pinned: item.is_pinned,
        is_muted: item.is_muted,
        is_archived: item.is_archived
      };
    }));

    setRooms(roomsData.sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      if ((a.unread_count || 0) > 0 && (b.unread_count || 0) === 0) return -1;
      if ((a.unread_count || 0) === 0 && (b.unread_count || 0) > 0) return 1;
      const dateA = a.last_message?.created_at || new Date(0);
      const dateB = b.last_message?.created_at || new Date(0);
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    }));
  };

  useEffect(() => {
    if (user) {
      fetchRooms();
      fetchProfile();
      
      const channel = supabase
        .channel('global-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => fetchRooms())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members' }, () => fetchRooms())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => fetchRooms())
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const onlineIds = new Set(Object.values(state).flat().map((p: any) => p.user_id));
          setOnlineUsers(onlineIds);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') await channel.track({ user_id: user.id });
        });

      return () => { supabase.removeChannel(channel); };
    }
  }, [user]);

  const handleGlobalSearch = async (query: string) => {
    setGlobalSearchQuery(query);
    if (query.length < 2) {
      setGlobalResults({ messages: [], users: [], links: [] });
      return;
    }

    setIsSearching(true);
    const { data: messages } = await supabase.from('messages').select('*, profiles(username, avatar_url)').ilike('content', `%${query}%`).limit(10);
    const { data: users } = await supabase.from('profiles').select('*').ilike('username', `%${query}%`).limit(5);
    const links = messages?.filter(m => m.content.includes('http')) || [];

    setGlobalResults({ messages: messages || [], users: users || [], links: links });
    setIsSearching(false);
  };

  const startChat = async (otherUser: any) => {
    if (otherUser.id === user?.id) { handleSavedMessages(); setIsNewChatOpen(false); return; }
    const { data: existingRoom } = await supabase.rpc('get_private_room', { user1: user?.id, user2: otherUser.id });
    if (existingRoom) { onSelectRoom(existingRoom); setIsNewChatOpen(false); return; }
    const { data: room, error: roomError } = await supabase.from('rooms').insert({ is_group: false }).select().single();
    if (roomError) return;
    await supabase.from('room_members').insert([{ room_id: room.id, user_id: user?.id }, { room_id: room.id, user_id: otherUser.id }]);
    onSelectRoom(room.id);
    setIsNewChatOpen(false);
    fetchRooms();
  };

  const handleSavedMessages = async () => {
    const { data: roomId } = await supabase.rpc('get_or_create_saved_messages_room', { user_id: user?.id });
    if (roomId) { onSelectRoom(roomId); fetchRooms(); }
  };

  const handleStartMatching = () => {
    setIsMatching(true);
    setTimeout(async () => {
      // Find a random user (excluding self)
      const { data: randomUsers } = await supabase.from('profiles').select('id').neq('id', user?.id).limit(10);
      if (randomUsers && randomUsers.length > 0) {
        const target = randomUsers[Math.floor(Math.random() * randomUsers.length)];
        // Start an anonymous room
        const { data: room } = await supabase.from('rooms').insert({ name: 'Anonymous Chat', is_group: false, is_anonymous: true }).select().single();
        if (room) {
          await supabase.from('room_members').insert([{ room_id: room.id, user_id: user?.id }, { room_id: room.id, user_id: target.id }]);
          onSelectRoom(room.id);
          setActiveSection('chats');
          toast.success('Connected to an anonymous session');
        }
      } else {
        toast.error('No nodes available for matching');
      }
      setIsMatching(false);
    }, 2000);
  };

  const renderChatsSection = () => (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-6 pb-2 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-primary rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(var(--primary),0.2)]">
              <Shield className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-black tracking-tighter text-foreground uppercase italic">AURA</h1>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => setGlobalSearchOpen(true)} className="h-10 w-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent-foreground hover:bg-accent/20 transition-all">
              <Search className="h-4 w-4" />
            </button>
            <button onClick={() => setIsNewChatOpen(true)} className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
          <Input 
            ref={searchInputRef}
            placeholder="Search..." 
            className="pl-12 h-12 rounded-2xl bg-accent/5 border-accent/10 text-foreground placeholder:text-muted-foreground/40 focus-visible:ring-primary/20 transition-all font-bold" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground italic">Stories</h2>
            <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
            <div className="flex flex-col items-center gap-2 shrink-0">
              <div className="h-16 w-16 rounded-full border-2 border-dashed border-muted-foreground/20 flex items-center justify-center relative group cursor-pointer">
                <Plus className="h-6 w-6 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                <div className="absolute bottom-0 right-0 h-5 w-5 bg-primary rounded-full border-2 border-background flex items-center justify-center shadow-sm"><Plus className="h-3 w-3 text-primary-foreground" /></div>
              </div>
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">New Story</span>
            </div>
            {[
              { name: 'My secret...', color: 'from-purple-500 to-blue-500', img: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop' },
              { name: 'A thought...', color: 'from-emerald-500 to-teal-500', img: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop' },
              { name: 'Eve ne...', color: 'from-pink-500 to-rose-500', img: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=100&h=100&fit=crop' },
              { name: 'Jos...', color: 'from-amber-500 to-orange-500', img: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=100&h=100&fit=crop' }
            ].map((story, i) => (
              <div key={i} className="flex flex-col items-center gap-2 shrink-0 cursor-pointer group">
                <div className={`h-16 w-16 rounded-full p-[2px] bg-gradient-to-tr ${story.color} group-hover:scale-105 transition-transform shadow-lg`}>
                  <div className="h-full w-full rounded-full border-2 border-background overflow-hidden">
                    <img src={story.img} alt={story.name} className="h-full w-full object-cover group-hover:grayscale-0 transition-all" />
                  </div>
                </div>
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter truncate w-16 text-center">{story.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <button className="w-full h-14 rounded-2xl bg-accent/5 border border-accent/10 flex items-center px-5 gap-4 group hover:bg-accent/10 transition-all relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:scale-110 transition-transform">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xs font-black uppercase tracking-[0.2em] text-foreground/80 group-hover:text-primary">Discovery Feed</span>
          </button>

          <button 
            onClick={() => setActiveSection('anonymous')}
            className="w-full h-14 rounded-2xl bg-accent/5 border border-accent/10 flex items-center px-5 gap-4 group hover:bg-accent/10 transition-all relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 group-hover:scale-110 transition-transform">
              <Ghost className="h-5 w-5 text-emerald-500" />
            </div>
            <div className="flex flex-1 items-center justify-between">
              <span className="text-xs font-black uppercase tracking-[0.2em] text-foreground/80 group-hover:text-emerald-500">Anonymous Vault</span>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                <span className="text-[10px] font-black text-emerald-500/80 tracking-widest uppercase">Live</span>
              </div>
            </div>
          </button>
        </div>
      </div>

      <div className="px-6 py-4 flex items-center justify-between">
        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground italic">Recent Channels</h2>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-accent/5 border border-accent/10">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[9px] font-black text-muted-foreground tracking-widest uppercase">{onlineUsers.size} ONLINE</span>
        </div>
      </div>

      <ScrollArea className="flex-1 px-4">
        <div className="space-y-1.5 pb-6">
          <AnimatePresence mode="popLayout">
            {filteredRooms.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/30">Zero nodes connected</p>
              </motion.div>
            ) : (
              filteredRooms.map((room) => {
                const isActive = selectedRoomId === room.id;
                const isOnline = room.other_user && onlineUsers.has(room.other_user.id);
                return (
                  <ContextMenu key={room.id}>
                    <ContextMenuTrigger asChild>
                      <motion.button layout onClick={() => onSelectRoom(room.id)} className={`group relative flex w-full items-center gap-4 rounded-[28px] p-4 transition-all ${isActive ? 'bg-primary text-primary-foreground shadow-xl' : 'hover:bg-accent/5 text-muted-foreground hover:text-foreground'}`}>
                        <div className="relative">
                          <Avatar className={`h-14 w-14 rounded-2xl border-2 transition-all ${isActive ? 'border-primary-foreground/20' : 'border-accent/10'}`}>
                            {room.is_saved_messages ? (
                              <div className="flex h-full w-full items-center justify-center bg-foreground text-background rounded-none"><Bookmark className="h-6 w-6" /></div>
                            ) : (
                              <><AvatarImage src={room.other_user?.avatar_url} className="rounded-none object-cover" /><AvatarFallback className="rounded-none bg-accent text-accent-foreground font-black">{(room.name || room.other_user?.username || 'C')[0]?.toUpperCase()}</AvatarFallback></>
                            )}
                          </Avatar>
                          {isOnline && <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full border-4 border-background bg-emerald-500 group-hover:scale-110 transition-transform shadow-sm" />}
                          {room.is_pinned && <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-amber-500 border-4 border-background flex items-center justify-center"><Pin className="h-2 w-2 text-background fill-background" /></div>}
                        </div>
                        <div className="flex-1 overflow-hidden text-left">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-[15px] font-black tracking-tight truncate uppercase italic ${isActive ? 'text-primary-foreground' : 'text-foreground'}`}>{room.is_saved_messages ? 'SECURE VAULT' : (room.name || room.other_user?.username)}</span>
                            {room.last_message && <span className={`text-[9px] font-black opacity-60 shrink-0 ${isActive ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{formatDistanceToNow(new Date(room.last_message.created_at), { addSuffix: false })}</span>}
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <p className={`text-xs truncate font-bold leading-tight flex-1 ${isActive ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{room.last_message?.content || 'Awaiting sync...'}</p>
                            {room.unread_count && room.unread_count > 0 && <span className={`flex h-6 w-6 items-center justify-center rounded-xl text-[10px] font-black ${isActive ? 'bg-primary-foreground text-primary shadow-sm' : 'bg-primary text-primary-foreground shadow-sm'}`}>{room.unread_count}</span>}
                          </div>
                        </div>
                      </motion.button>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-56 rounded-3xl bg-popover/95 backdrop-blur-2xl border-border text-popover-foreground p-2 shadow-2xl">
                      <ContextMenuItem onClick={() => handleTogglePin(room.id, !!room.is_pinned)} className="rounded-2xl gap-3 p-3 cursor-pointer hover:bg-accent transition-colors"><Pin className="h-4 w-4" /><span className="text-xs font-black uppercase tracking-widest">{room.is_pinned ? 'Unpin' : 'Pin'}</span></ContextMenuItem>
                      <ContextMenuItem onClick={() => handleToggleMute(room.id, !!room.is_muted)} className="rounded-2xl gap-3 p-3 cursor-pointer hover:bg-accent transition-colors">{room.is_muted ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}<span className="text-xs font-black uppercase tracking-widest">{room.is_muted ? 'Unmute' : 'Mute'}</span></ContextMenuItem>
                      <ContextMenuItem onClick={() => handleArchive(room.id)} className="rounded-2xl gap-3 p-3 cursor-pointer hover:bg-accent transition-colors"><Archive className="h-4 w-4" /><span className="text-xs font-black uppercase tracking-widest">Archive</span></ContextMenuItem>
                      <ContextMenuItem onClick={() => handleDelete(room.id)} className="rounded-2xl gap-3 p-3 text-red-500 cursor-pointer hover:bg-red-500/10 transition-colors"><Trash2 className="h-4 w-4" /><span className="text-xs font-black uppercase tracking-widest">Delete</span></ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );

  const renderAnonymousSection = () => (
    <div className="flex flex-col h-full p-8 items-center justify-center text-center space-y-12 bg-background">
      <div className="h-40 w-40 rounded-[60px] bg-accent/5 border border-accent/10 flex items-center justify-center shadow-2xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <Ghost className="h-20 w-20 text-emerald-500 animate-pulse" />
      </div>
      
      <div className="space-y-4 max-w-xs">
        <h2 className="text-4xl font-black italic tracking-tighter uppercase text-foreground">ANONYMOUS</h2>
        <p className="text-sm text-muted-foreground font-medium leading-relaxed uppercase tracking-tight">Connect to a random node without sharing your identity. No profiles, no traces, total vault encryption.</p>
      </div>

      <div className="space-y-3 w-full">
        <Button 
          onClick={handleStartMatching}
          disabled={isMatching}
          className="w-full h-16 rounded-3xl bg-primary text-primary-foreground font-black text-sm uppercase tracking-widest shadow-xl hover:scale-[1.02] transition-all"
        >
          {isMatching ? 'Searching Network...' : 'Initialize Random Sync'}
        </Button>
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Encryption node active</p>
      </div>
    </div>
  );

  const renderMoreSection = () => (
    <div className="flex flex-col h-full bg-background">
      <div className="p-8 pb-4">
        <h2 className="text-4xl font-black italic tracking-tighter uppercase mb-8 text-foreground">MORE</h2>
        <div className="space-y-3">
          {[
            { label: 'Saved Messages', icon: <Bookmark className="h-5 w-5" />, action: handleSavedMessages },
            { label: 'Archived Nodes', icon: <Archive className="h-5 w-5" />, action: () => { setActiveTab('saved'); setActiveSection('chats'); } },
            { label: 'Network Support', icon: <HelpCircle className="h-5 w-5" />, action: () => toast.info('Support link active') },
            { label: 'Invite Nodes', icon: <Share2 className="h-5 w-5" />, action: () => toast.info('Invite code copied') },
          ].map(item => (
            <button key={item.label} onClick={item.action} className="w-full flex items-center justify-between p-6 rounded-[32px] bg-accent/5 border border-accent/10 hover:bg-primary hover:text-primary-foreground transition-all group shadow-sm">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-2xl bg-accent/10 flex items-center justify-center group-hover:bg-primary-foreground/10">{item.icon}</div>
                <span className="text-sm font-black uppercase tracking-widest">{item.label}</span>
              </div>
              <ChevronRight className="h-4 w-4 opacity-20 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderSettingsSection = () => (
    <ScrollArea className="flex-1 bg-background">
      <div className="p-8 space-y-12 pb-20">
        <div className="flex flex-col items-center gap-6 text-center">
          <Avatar className="h-32 w-32 rounded-[40px] border-8 border-accent/5 shadow-2xl transition-all hover:scale-105">
            <AvatarImage src={profile?.avatar_url} />
            <AvatarFallback className="text-4xl font-black bg-primary text-primary-foreground">{profile?.username?.[0]}</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <h2 className="text-3xl font-black italic tracking-tighter uppercase text-foreground">{profile?.username || 'Aura identity'}</h2>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-3 w-3" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em]">Aura Level {profile?.aura_level || 1}</span>
            </div>
          </div>
        </div>

        <div className="space-y-10">
          <div className="space-y-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground italic border-l-4 border-primary pl-4">Security & Sync</h3>
            <div className="space-y-4">
              {[
                { id: 'readReceipts', label: 'Read Receipts', icon: <Eye className="h-5 w-5" />, desc: 'Others see when you read' },
                { id: 'showOnlineStatus', label: 'Online Visibility', icon: <Clock className="h-5 w-5" />, desc: 'Show status to network' },
                { id: 'quietHours', label: 'Quiet Hours', icon: <VolumeX className="h-5 w-5" />, desc: 'Mute all pulse alerts' }
              ].map(s => (
                <div key={s.id} className="flex items-center justify-between p-4 rounded-3xl bg-accent/5 hover:bg-accent/10 transition-all border border-transparent hover:border-accent/10">
                  <div className="flex gap-4">
                    <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">{s.icon}</div>
                    <div>
                      <div className="text-sm font-black text-foreground">{s.label}</div>
                      <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-tight">{s.desc}</div>
                    </div>
                  </div>
                  <button onClick={() => updateSettings({ [s.id]: !(settings as any)[s.id] })} className={`h-7 w-12 rounded-full transition-all relative border-2 ${(settings as any)[s.id] ? 'bg-primary border-primary' : 'bg-transparent border-muted-foreground/20'}`}>
                    <div className={`absolute top-1 h-3.5 w-3.5 rounded-full transition-all ${(settings as any)[s.id] ? 'left-6 bg-primary-foreground' : 'left-1 bg-muted-foreground/40'}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground italic border-l-4 border-primary pl-4">Theme & Appearance</h3>
            
            <div className="space-y-4">
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-1">Interface Mode</label>
                <div className="flex gap-2 p-1.5 bg-accent/5 rounded-2xl border border-accent/10">
                  {[
                    { id: 'light', icon: <Sun className="h-4 w-4" />, label: 'Light' },
                    { id: 'dark', icon: <Moon className="h-4 w-4" />, label: 'Dark' },
                    { id: 'system', icon: <Monitor className="h-4 w-4" />, label: 'System' }
                  ].map(t => (
                    <button 
                      key={t.id} 
                      onClick={() => updateSettings({ theme: t.id })} 
                      className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl transition-all ${theme === t.id ? 'bg-primary text-primary-foreground shadow-lg' : 'text-muted-foreground hover:text-foreground hover:bg-accent/10'}`}
                    >
                      {t.icon}
                      <span className="text-[9px] font-black uppercase tracking-widest">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-1">Theme Accent</label>
                <div className="flex flex-wrap gap-3 p-4 bg-accent/5 rounded-3xl border border-accent/10">
                  {[
                    { color: '#3b82f6', label: 'Neon Blue' },
                    { color: '#10b981', label: 'Emerald' },
                    { color: '#8b5cf6', label: 'Ultraviolet' },
                    { color: '#f59e0b', label: 'Amber' },
                    { color: '#f43f5e', label: 'Rose' },
                    { color: '#ffffff', label: 'Monochrome' }
                  ].map(c => (
                    <button 
                      key={c.color} 
                      onClick={() => updateSettings({ accentColor: c.color })} 
                      className={`h-10 w-10 rounded-full border-4 transition-all hover:scale-110 shadow-sm ${settings.accentColor === c.color ? 'border-foreground' : 'border-transparent'}`}
                      style={{ backgroundColor: c.color }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-1">Type Scale</label>
                <div className="flex gap-2 p-1.5 bg-accent/5 rounded-2xl border border-accent/10">
                  {['Small', 'Medium', 'Large'].map(sz => (
                    <button key={sz} onClick={() => updateSettings({ fontSize: sz.toLowerCase() })} className={`flex-1 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${settings.fontSize === sz.toLowerCase() ? 'bg-primary text-primary-foreground shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}>{sz}</button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-3xl bg-accent/5 hover:bg-accent/10 transition-all border border-transparent hover:border-accent/10">
                <div className="flex gap-4">
                  <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary"><Contrast className="h-5 w-5" /></div>
                  <div className="text-sm font-black text-foreground">High Contrast</div>
                </div>
                <button onClick={() => updateSettings({ highContrast: !settings.highContrast })} className={`h-7 w-12 rounded-full transition-all relative border-2 ${settings.highContrast ? 'bg-primary border-primary' : 'bg-transparent border-muted-foreground/20'}`}>
                  <div className={`absolute top-1 h-3.5 w-3.5 rounded-full transition-all ${settings.highContrast ? 'left-6 bg-primary-foreground' : 'left-1 bg-muted-foreground/40'}`} />
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-1">Data Retention</label>
            <div className="grid grid-cols-2 gap-2">
              {['24 Hours', '7 Days', '30 Days', 'Forever'].map(val => (
                <button key={val} onClick={() => updateSettings({ messageRetention: val.toLowerCase() })} className={`h-12 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${settings.messageRetention === val.toLowerCase() ? 'bg-primary text-primary-foreground border-primary shadow-lg' : 'bg-accent/5 text-muted-foreground border-accent/10'}`}>{val}</button>
              ))}
            </div>
          </div>

          <div className="pt-10">
            <Button variant="ghost" className="w-full h-14 justify-start gap-4 rounded-2xl text-red-500 hover:bg-red-500/10 hover:text-red-500 font-black text-xs uppercase tracking-widest transition-all group" onClick={async () => {
              const confirmed = window.confirm('Terminate your identity node? This action is permanent.');
              if (confirmed) {
                await supabase.auth.signOut();
                window.location.reload();
              }
            }}>
              <LogOut className="h-5 w-5 group-hover:rotate-12 transition-transform" />
              Terminate Node
            </Button>
          </div>
        </div>
      </div>
    </ScrollArea>
  );

  return (
    <div className="flex h-full w-full flex-col bg-background border-r border-border selection:bg-primary selection:text-primary-foreground font-sans relative">
      <div className="flex-1 overflow-hidden">
        {activeSection === 'chats' && renderChatsSection()}
        {activeSection === 'anonymous' && renderAnonymousSection()}
        {activeSection === 'more' && renderMoreSection()}
        {activeSection === 'settings' && renderSettingsSection()}
      </div>

      {/* Global Navigation */}
      <div className="p-4 pt-2 bg-background/80 backdrop-blur-xl border-t border-border">
        <div className="flex items-center justify-around gap-1">
          {[
            { id: 'chats', label: 'Chats', icon: <MessageCircle className="h-5 w-5" /> },
            { id: 'anonymous', label: 'Anonymous', icon: <Ghost className="h-5 w-5" /> },
            { id: 'more', label: 'More', icon: <MoreHorizontal className="h-5 w-5" /> },
            { id: 'settings', label: 'Settings', icon: <UserCircle className="h-5 w-5" /> },
          ].map(nav => (
            <button
              key={nav.id}
              onClick={() => setActiveSection(nav.id as any)}
              className={`flex flex-col items-center gap-1.5 px-4 py-2 rounded-2xl transition-all relative ${activeSection === nav.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <div className={`transition-transform duration-300 ${activeSection === nav.id ? 'scale-110' : ''}`}>
                {nav.icon}
              </div>
              <span className={`text-[9px] font-black uppercase tracking-widest transition-all ${activeSection === nav.id ? 'opacity-100' : 'opacity-40'}`}>{nav.label}</span>
              {activeSection === nav.id && (
                <motion.div 
                  layoutId="nav-active-pill" 
                  className="absolute inset-0 bg-primary/5 rounded-2xl -z-10" 
                  initial={false}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Global Command Menu */}
      <Dialog open={globalSearchOpen} onOpenChange={setGlobalSearchOpen}>
        <DialogContent className="rounded-[40px] border-border bg-popover/95 backdrop-blur-3xl shadow-2xl p-0 overflow-hidden max-w-2xl">
          <div className="p-8 border-b border-border">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/40" />
              <Input autoFocus placeholder="Search nodes, messages, archives..." className="h-16 pl-14 pr-20 rounded-2xl bg-accent/5 border-accent/20 text-lg font-bold placeholder:text-muted-foreground/40 focus-visible:ring-primary/20" value={globalSearchQuery} onChange={(e) => handleGlobalSearch(e.target.value)} />
            </div>
          </div>
          <ScrollArea className="h-[400px] p-8">
            {isSearching ? (
              <div className="flex items-center justify-center h-full gap-3 opacity-40">
                <Zap className="h-5 w-5 animate-pulse text-primary" />
                <span className="text-xs font-black uppercase tracking-widest">Scanning Network...</span>
              </div>
            ) : (
              <div className="space-y-8 pb-10">
                {globalResults.users.length > 0 && (
                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground mb-4 border-l-2 border-primary pl-2">Identities</h3>
                    <div className="space-y-1">
                      {globalResults.users.map(u => (
                        <button key={u.id} onClick={() => { startChat(u); setGlobalSearchOpen(false); }} className="flex items-center gap-4 w-full p-4 rounded-2xl hover:bg-primary hover:text-primary-foreground transition-all group">
                          <Avatar className="h-10 w-10 border border-accent/20"><AvatarImage src={u.avatar_url} /><AvatarFallback>{u.username?.[0]}</AvatarFallback></Avatar>
                          <div className="text-left"><div className="text-sm font-black uppercase italic tracking-tight">{u.username}</div></div>
                          <ChevronRight className="h-4 w-4 ml-auto opacity-20 group-hover:opacity-100" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {globalResults.messages.length > 0 && (
                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground mb-4 border-l-2 border-primary pl-2">Messages</h3>
                    <div className="space-y-2">
                      {globalResults.messages.map(m => (
                        <button key={m.id} onClick={() => { onSelectRoom(m.room_id); setGlobalSearchOpen(false); }} className="flex flex-col gap-2 w-full p-5 rounded-2xl bg-accent/5 hover:bg-accent/10 transition-all border border-accent/10 text-left group">
                          <div className="flex items-center justify-between"><div className="text-[10px] font-black uppercase tracking-widest text-primary">@{m.profiles.username}</div><span className="text-[8px] opacity-40 font-black">{format(new Date(m.created_at), 'MMM dd')}</span></div>
                          <p className="text-sm font-bold leading-relaxed text-foreground/80">{m.content}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {globalSearchQuery && globalResults.users.length === 0 && globalResults.messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-center opacity-40 gap-4">
                    <ShieldAlert className="h-12 w-12" />
                    <p className="text-[10px] font-black uppercase tracking-[0.4em]">Zero matches detected in vault</p>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={isNewChatOpen} onOpenChange={setIsNewChatOpen}>
        <DialogContent className="rounded-[40px] border-border bg-popover shadow-2xl p-8 max-w-sm">
          <div className="space-y-8">
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-foreground italic tracking-tight uppercase">New Node</h2>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Connect to another identity</p>
            </div>
            <Input placeholder="Find username..." className="h-14 rounded-2xl bg-accent/5 border-accent/20 text-foreground font-bold focus-visible:ring-primary/20" value={userSearchQuery} onChange={(e) => {
              setUserSearchQuery(e.target.value);
              if (e.target.value.length > 1) supabase.from('profiles').select('*').ilike('username', `%${e.target.value}%`).limit(10).then(({ data }) => setUsers(data || []));
            }} />
            <ScrollArea className="max-h-[300px] pr-2">
              <div className="space-y-2">
                {users.map((u) => (
                  <button key={u.id} onClick={() => startChat(u)} className="flex items-center justify-between w-full p-4 rounded-2xl hover:bg-primary hover:text-primary-foreground group transition-all">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 border border-accent/20"><AvatarImage src={u.avatar_url} /><AvatarFallback>{u.username?.[0]}</AvatarFallback></Avatar>
                      <span className="font-bold uppercase italic tracking-tight">{u.username}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 opacity-20 group-hover:opacity-100" />
                  </button>
                ))}
                {userSearchQuery.length > 1 && users.length === 0 && (
                  <p className="text-[10px] font-black text-center text-muted-foreground/40 py-10 uppercase tracking-widest">No nodes found</p>
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
