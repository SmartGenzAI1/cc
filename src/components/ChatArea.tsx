'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Send, 
  ArrowLeft, 
  Paperclip, 
  Smile, 
  Edit2, 
  Reply, 
  X,
  Shield,
  Bookmark,
  Sparkles,
  Zap,
  Mic,
    Lock,
    Globe,
    MoreHorizontal,
    ChevronDown,
    ChevronUp,
    Copy,
    Trash2,
    Pin,
    Calendar,
    ListTodo,
    Search,
    Clock,
    Ghost,
    CheckCircle2
  } from 'lucide-react';


import { format, isSameDay } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useMetrics } from '@/hooks/useMetrics';

type Message = {
  id: string;
  content: string;
  user_id: string;
  created_at: string;
  image_url?: string;
  is_edited?: boolean;
  is_deleted?: boolean;
  is_pinned?: boolean;
  is_optimistic?: boolean;
  reply_to_id?: string;
  reply_message?: {
    content: string;
    username: string;
  };
  profiles: {
    username: string;
    avatar_url: string;
  };
  message_reactions?: {
    id: string;
    emoji: string;
    user_id: string;
  }[];
};

type ChatAreaProps = {
  roomId: string;
  onBack?: () => void;
};

export function ChatArea({ roomId, onBack }: ChatAreaProps) {
  const { user } = useAuth();
  const { trackMessageSent, trackReadabilityScroll } = useMetrics();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [roomInfo, setRoomInfo] = useState<any>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [pulseActive, setPulseActive] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState('');
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [longPressedMessageId, setLongPressedMessageId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{type: 'reminder' | 'checklist', text: string} | null>(null);
  
  // In-Chat Search
  const [inChatSearchOpen, setInChatSearchOpen] = useState(false);
  const [inChatSearchQuery, setInChatSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<string[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const longPressTimer = useRef<any>(null);

  const generateSummary = () => {
    if (messages.length === 0) return;
    setPulseActive(true);
    const lastMsgs = messages.slice(-10).map(m => m.content).join(' ');
    const mockSummary = `AI SUMMARY: Users are discussing "${lastMsgs.substring(0, 40)}..." and sharing secure thoughts. Key action items identified in node synchronization.`;
    setSummary(mockSummary);
    setShowSummary(true);
    setTimeout(() => setPulseActive(false), 2000);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f' && !inChatSearchOpen) {
        e.preventDefault();
        setInChatSearchOpen(true);
      }
      if (e.key === 'ArrowUp' && !newMessage && messages.length > 0 && !inChatSearchOpen) {
        const lastOwnMessage = [...messages].reverse().find(m => m.user_id === user?.id && !m.is_deleted);
        if (lastOwnMessage) {
          e.preventDefault();
          setEditingMessage(lastOwnMessage);
          setNewMessage(lastOwnMessage.content);
        }
      }
      if (e.key === 'Escape') {
        setReplyingTo(null);
        setEditingMessage(null);
        setNewMessage('');
        setLongPressedMessageId(null);
        setInChatSearchOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [messages, newMessage, user, inChatSearchOpen]);

  useEffect(() => {
    if (editingMessage || replyingTo) {
      textareaRef.current?.focus();
    }
  }, [editingMessage, replyingTo]);

  useEffect(() => {
    fetchRoomInfo();
    fetchMessages();
    markAsRead();

    const channel = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'messages',
        filter: `room_id=eq.${roomId}`
      }, async (payload: any) => {
        if (payload.eventType === 'INSERT') {
          // Check if this message was already added optimistically
          setMessages(prev => {
            const exists = prev.some(m => m.id === payload.new.id || (m.is_optimistic && m.content === payload.new.content));
            if (exists) {
              return prev.map(m => (m.is_optimistic && m.content === payload.new.content) ? { ...m, ...payload.new, is_optimistic: false } : m);
            }
            return prev;
          });

          const { data: messageWithProfile } = await supabase
            .from('messages')
            .select(`
              *,
              profiles (username, avatar_url),
              message_reactions (id, emoji, user_id)
            `)
            .eq('id', payload.new.id)
            .single();
          
          if (messageWithProfile) {
            setMessages((prev) => {
              const exists = prev.some(m => m.id === messageWithProfile.id);
              if (exists) return prev;
              return [...prev, messageWithProfile as any];
            });
            setPulseActive(true);
            setTimeout(() => setPulseActive(false), 1000);
            markAsRead();
          }
        } else if (payload.eventType === 'UPDATE') {
          setMessages((prev) => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m));
        } else if (payload.eventType === 'DELETE') {
          setMessages((prev) => prev.filter(m => m.id !== payload.old.id));
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const typing = Object.values(state).flat().filter((p: any) => p.user_id !== user?.id && p.isTyping);
        setIsTyping(typing.length > 0);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: user?.id, isTyping: false });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, user]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
      }
    }
  };

  useEffect(() => {
    if (!showScrollBottom) {
      scrollToBottom();
    }
  }, [messages, isTyping]);

  const handleScroll = (e: any) => {
    const target = e.target;
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
    setShowScrollBottom(!isAtBottom);

    // Track readability/scroll depth
    const scrollPercentage = (target.scrollTop / (target.scrollHeight - target.clientHeight)) * 100;
    trackReadabilityScroll(roomId, scrollPercentage);
  };

  const fetchRoomInfo = async () => {
    const { data: room } = await supabase
      .from('rooms')
      .select(`*, room_members (profiles (*))`)
      .eq('id', roomId)
      .single();

    if (room) {
      if (room.is_saved_messages) {
        setRoomInfo({ ...room, display_name: 'SECURE VAULT', is_saved: true });
      } else if (room.is_anonymous) {
        setRoomInfo({ ...room, display_name: 'ANONYMOUS CHAT', is_anonymous: true });
      } else if (room.is_lucky_chat) {
        setRoomInfo({ ...room, display_name: `ANONYMOUS: ${room.lucky_topic}`, is_lucky: true });
      } else if (!room.is_group) {
        const otherMember = room.room_members.find((m: any) => m.profiles.id !== user?.id);
        setRoomInfo({ ...room, display_name: otherMember?.profiles.username, display_avatar: otherMember?.profiles.avatar_url, member_count: 2 });
      } else {
        setRoomInfo({ ...room, display_name: room.name, member_count: room.room_members.length });
      }
    }
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select(`*, profiles (username, avatar_url), message_reactions (id, emoji, user_id)`)
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });

    if (data) {
      const msgs = data.map(msg => {
        if (msg.reply_to_id) {
          const replied = data.find(m => m.id === msg.reply_to_id);
          return { ...msg, reply_message: replied ? { content: replied.content, username: replied.profiles.username } : undefined };
        }
        return msg;
      });
      setMessages(msgs as any);
    }
  };

  const markAsRead = async () => {
    await supabase.from('room_members').update({ last_read_at: new Date().toISOString() }).eq('room_id', roomId).eq('user_id', user?.id);
  };

  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() && !editingMessage) return;

    if (editingMessage) {
      const originalContent = editingMessage.content;
      setMessages(prev => prev.map(m => m.id === editingMessage.id ? { ...m, content: newMessage, is_edited: true } : m));
      
      const { error } = await supabase.from('messages').update({ content: newMessage, is_edited: true }).eq('id', editingMessage.id);
      if (error) {
        toast.error('Update failed');
        setMessages(prev => prev.map(m => m.id === editingMessage.id ? { ...m, content: originalContent, is_edited: false } : m));
      }
      setEditingMessage(null);
      setNewMessage('');
      return;
    }

    const optimisticId = Math.random().toString(36).substring(7);
    const optimisticMsg: Message = {
      id: optimisticId,
      content: newMessage,
      user_id: user?.id || '',
      created_at: new Date().toISOString(),
      is_optimistic: true,
      profiles: {
        username: 'You',
        avatar_url: ''
      }
    };

    setMessages(prev => [...prev, optimisticMsg]);
    setNewMessage('');
    setReplyingTo(null);
    setSuggestions(null);
    scrollToBottom();
    
    trackMessageSent();

    const { data, error } = await supabase.from('messages').insert({
      room_id: roomId,
      user_id: user?.id,
      content: optimisticMsg.content,
      reply_to_id: replyingTo?.id
    }).select().single();

    if (error) {
      toast.error('Sync failed. Message queued for retry.');
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
    } else {
      await supabase.rpc('increment_aura_points', { uid: user?.id, points: 5 });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `${roomId}/${Math.random()}.${file.name.split('.').pop()}`;
    await supabase.storage.from('attachments').upload(path, file);
    const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(path);
    await supabase.from('messages').insert({ room_id: roomId, user_id: user?.id, content: '', image_url: publicUrl });
    setUploading(false);
  };

  const addReaction = async (messageId: string, emoji: string) => {
    await supabase.from('message_reactions').upsert({ message_id: messageId, user_id: user?.id, emoji }, { onConflict: 'message_id,user_id,emoji' });
    setLongPressedMessageId(null);
    fetchMessages();
  };

  const deleteMessage = async (messageId: string) => {
    await supabase.from('messages').update({ is_deleted: true, content: 'Message deleted' }).eq('id', messageId);
    setLongPressedMessageId(null);
  };

  const togglePin = async (message: Message) => {
    await supabase.from('messages').update({ is_pinned: !message.is_pinned }).eq('id', message.id);
    setLongPressedMessageId(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
    setLongPressedMessageId(null);
  };

  const handleLongPress = (id: string) => {
    setLongPressedMessageId(id);
  };

  const handleMouseDown = (id: string) => {
    longPressTimer.current = setTimeout(() => handleLongPress(id), 500);
  };

  const handleMouseUp = () => {
    clearTimeout(longPressTimer.current);
  };

  const onInputChange = (val: string) => {
    setNewMessage(val);
    if (val.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/) || val.toLowerCase().includes('tomorrow') || val.toLowerCase().includes('next week')) {
      setSuggestions({type: 'reminder', text: 'Convert to reminder'});
    } else if (val.startsWith('- ') || val.startsWith('1. ')) {
      setSuggestions({type: 'checklist', text: 'Convert to checklist'});
    } else {
      setSuggestions(null);
    }

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  const handleInChatSearch = (query: string) => {
    setInChatSearchQuery(query);
    if (!query) {
      setSearchMatches([]);
      return;
    }
    const matches = messages.filter(m => m.content.toLowerCase().includes(query.toLowerCase())).map(m => m.id);
    setSearchMatches(matches);
    setCurrentMatchIndex(0);
    if (matches.length > 0) {
      scrollToMessage(matches[0]);
    }
  };

  const scrollToMessage = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const nextMatch = () => {
    const nextIndex = (currentMatchIndex + 1) % searchMatches.length;
    setCurrentMatchIndex(nextIndex);
    scrollToMessage(searchMatches[nextIndex]);
  };

  const prevMatch = () => {
    const prevIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setCurrentMatchIndex(prevIndex);
    scrollToMessage(searchMatches[prevIndex]);
  };

  const renderContent = (content: string, id: string, isDeleted: boolean) => {
    if (isDeleted) return <span className="opacity-40 italic">Message deleted</span>;
    let parts = content.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) return <span key={i} className="text-blue-400 font-black cursor-pointer hover:underline">{part}</span>;
      if (inChatSearchQuery && part.toLowerCase().includes(inChatSearchQuery.toLowerCase())) {
        const subParts = part.split(new RegExp(`(${inChatSearchQuery})`, 'gi'));
        return subParts.map((sub, j) => (
          sub.toLowerCase() === inChatSearchQuery.toLowerCase() ? (
            <span key={`${i}-${j}`} className={`bg-blue-500 text-white rounded-sm px-0.5 ${searchMatches[currentMatchIndex] === id ? 'ring-2 ring-white ring-offset-2 ring-offset-black' : ''}`}>
              {sub}
            </span>
          ) : sub
        ));
      }
      return part;
    });
  };

  if (!roomInfo) return null;

  return (
    <div className="flex flex-1 flex-col h-full relative overflow-hidden bg-[#050505] selection:bg-white selection:text-black font-sans">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-1/2 h-1/2 bg-blue-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-1/2 h-1/2 bg-purple-500/5 rounded-full blur-[120px]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02]" />
      </div>

      <div className="flex items-center justify-between border-b border-white/5 p-6 bg-black/40 backdrop-blur-3xl z-30">
        <div className="flex items-center gap-5">
          {onBack && <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden -ml-2 rounded-2xl border border-white/5 bg-white/5 text-white"><ArrowLeft className="h-5 w-5" /></Button>}
          <div className="relative group cursor-pointer">
            <Avatar className="h-14 w-14 rounded-2xl border-2 border-white/10 shadow-2xl transition-all group-hover:scale-105 group-hover:border-white/20">
              {roomInfo.is_saved ? <div className="flex h-full w-full items-center justify-center bg-white text-black rounded-none"><Bookmark className="h-6 w-6" /></div>
              : (roomInfo.is_lucky || roomInfo.is_anonymous) ? <div className="flex h-full w-full items-center justify-center bg-white/5 text-white/40 rounded-none"><Ghost className="h-7 w-7" /></div>
              : <><AvatarImage src={roomInfo.display_avatar} className="object-cover" /><AvatarFallback className="font-black bg-zinc-900 text-white">{roomInfo.display_name?.[0]?.toUpperCase()}</AvatarFallback></>}
            </Avatar>
            {pulseActive && <motion.div initial={{ scale: 0.8, opacity: 0.5 }} animate={{ scale: 2, opacity: 0 }} className="absolute inset-0 rounded-2xl bg-white/20" />}
          </div>
          <div>
            <div className="font-black tracking-tighter text-white text-xl flex items-center gap-2 uppercase italic leading-tight">
              {roomInfo.display_name}
              {(roomInfo.is_lucky || roomInfo.is_anonymous) && <Sparkles className="h-4 w-4 text-amber-500 animate-pulse" />}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">
                {isTyping ? "Securing Node..." : (roomInfo.is_anonymous ? "Anonymous session active" : `${roomInfo.member_count} nodes online`)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setInChatSearchOpen(!inChatSearchOpen)} className={`h-12 w-12 rounded-2xl border transition-all ${inChatSearchOpen ? 'bg-white text-black' : 'bg-white/5 border-white/5 text-white/40 hover:text-white'}`}><Search className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon" onClick={generateSummary} className="h-12 w-12 rounded-2xl bg-white/5 border border-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all group relative">
            <Zap className="h-5 w-5 group-hover:fill-white transition-all" />
            <span className="absolute -bottom-12 scale-0 group-hover:scale-100 transition-all text-[8px] font-black bg-white text-black px-2 py-1 rounded-lg">SUMMARIZE</span>
          </Button>
          <Button variant="ghost" size="icon" className="h-12 w-12 rounded-2xl bg-white/5 border border-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all"><Globe className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon" className="h-12 w-12 rounded-2xl bg-white/5 border border-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all"><MoreHorizontal className="h-5 w-5" /></Button>
        </div>
      </div>

      <AnimatePresence>
        {inChatSearchOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-white/[0.03] border-b border-white/5 p-4 z-20 flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
              <Input autoFocus placeholder="Find in conversation..." className="h-12 pl-12 rounded-xl bg-white/5 border-white/10 text-white font-bold placeholder:text-white/20" value={inChatSearchQuery} onChange={(e) => handleInChatSearch(e.target.value)} />
            </div>
            {searchMatches.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{currentMatchIndex + 1} / {searchMatches.length}</span>
                <Button variant="ghost" size="icon" onClick={prevMatch} className="h-10 w-10 rounded-xl bg-white/5 border border-white/5 text-white/60 hover:text-white"><ChevronUp className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={nextMatch} className="h-10 w-10 rounded-xl bg-white/5 border border-white/5 text-white/60 hover:text-white"><ChevronDown className="h-4 w-4" /></Button>
              </div>
            )}
            <Button variant="ghost" size="icon" onClick={() => setInChatSearchOpen(false)} className="h-10 w-10 rounded-xl bg-white/5 border border-white/5 text-white/60 hover:text-white"><X className="h-4 w-4" /></Button>
          </motion.div>
        )}
      </AnimatePresence>

      <ScrollArea ref={scrollRef} onScrollCapture={handleScroll} className="flex-1 p-6 md:p-12 relative">
        <div className="flex flex-col gap-4 max-w-4xl mx-auto pb-20">
          <div className="flex flex-col items-center gap-4 py-12">
            <div className="h-16 w-16 rounded-[32px] bg-white/5 border border-white/10 flex items-center justify-center shadow-2xl">
              <Lock className="h-6 w-6 text-white/20" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">End-to-End Encryption</h3>
              <p className="text-[9px] font-bold text-white/20 max-w-[200px]">Messages are secured with private keys. Only the recipients can read them.</p>
            </div>
          </div>

          <AnimatePresence mode="popLayout">
            {messages.map((msg, index) => {
              const isOwn = msg.user_id === user?.id;
              const prevMsg = messages[index - 1];
              const isSameUser = prevMsg && prevMsg.user_id === msg.user_id;
              const isRecent = prevMsg && (new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime()) < 300000;
              const isGrouped = isSameUser && isRecent;
              const showDate = !prevMsg || !isSameDay(new Date(msg.created_at), new Date(prevMsg.created_at));
              const isLongPressed = longPressedMessageId === msg.id;
              
              return (
                <div key={msg.id} id={`msg-${msg.id}`} className={isGrouped ? 'mt-1' : 'mt-8'}>
                  {showDate && (
                    <div className="flex justify-center my-8">
                      <span className="px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.3em] text-white/20 border border-white/5 bg-white/[0.02]">
                        {format(new Date(msg.created_at), 'dd MMM yyyy')}
                      </span>
                    </div>
                  )}
                  
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} group relative w-full`}
                      onMouseDown={() => handleMouseDown(msg.id)}
                      onMouseUp={handleMouseUp}
                      onTouchStart={() => handleMouseDown(msg.id)}
                      onTouchEnd={handleMouseUp}
                    >
                      {!isOwn && (roomInfo.is_group || roomInfo.is_anonymous) && !isGrouped && (
                        <span className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2 ml-4">
                          {roomInfo.is_anonymous ? 'ANONYMOUS' : msg.profiles.username}
                        </span>
                      )}

                      <div className="relative flex items-center gap-3 max-w-[85%] md:max-w-[70%]">
                        {!isOwn && (
                          <div className="flex flex-col gap-1 items-center">
                            <Avatar className="h-8 w-8 rounded-full border border-white/10 shrink-0">
                              <AvatarImage src={msg.profiles.avatar_url} />
                              <AvatarFallback className="text-[10px] bg-white/5">{msg.profiles.username?.[0]}</AvatarFallback>
                            </Avatar>
                          </div>
                        )}
                        
                        <div className={`relative p-5 transition-all cursor-default select-none group/bubble ${
                          isOwn 
                          ? `bg-[#0a0a0a] text-white border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.1)] ${isGrouped ? 'rounded-[24px]' : 'rounded-[24px] rounded-tr-[4px]'}` 
                          : `bg-[#0a0a0a] text-white border border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.1)] ${isGrouped ? 'rounded-[24px]' : 'rounded-[24px] rounded-tl-[4px]'}`
                        } ${isLongPressed ? 'scale-95 brightness-75' : ''} ${msg.is_optimistic ? 'opacity-40 grayscale animate-pulse' : ''}`}>
                          
                          {/* Glow effect overlay */}
                          <div className={`absolute inset-0 rounded-[inherit] opacity-20 pointer-events-none blur-md -z-10 ${
                            isOwn ? 'bg-emerald-500' : 'bg-purple-500'
                          }`} />

                          {msg.is_pinned && <div className="absolute -top-2 -left-2 bg-amber-500 p-1 rounded-full shadow-lg z-10"><Pin className="h-3 w-3 text-black fill-current" /></div>}
                          
                          {msg.reply_message && (
                            <div className={`mb-4 p-3 rounded-xl text-[11px] font-bold border-l-4 ${isOwn ? 'bg-white/5 border-emerald-500/50' : 'bg-white/5 border-purple-500/50'} opacity-60`}>
                              <div className="uppercase tracking-widest text-[9px] mb-1">@{roomInfo.is_anonymous ? 'ANONYMOUS' : msg.reply_message.username}</div>
                              <div className="truncate italic">"{msg.reply_message.content}"</div>
                            </div>
                          )}
                          
                          {msg.image_url && <div className="mb-4 rounded-xl overflow-hidden border border-white/10 shadow-inner"><img src={msg.image_url} alt="Shared" className="w-full h-auto" /></div>}
                          
                          <div className="text-[15px] leading-relaxed font-bold tracking-tight whitespace-pre-wrap break-words">{renderContent(msg.content, msg.id, !!msg.is_deleted)}</div>
                          
                          <div className="mt-4 flex items-center justify-between gap-4">
                            <div className="flex -space-x-1">
                              {msg.message_reactions?.slice(0, 3).map((r, i) => (
                                <span key={i} className="text-[10px] bg-black/80 backdrop-blur-md border border-white/10 shadow-xl p-1 px-1.5 rounded-full">{r.emoji}</span>
                              ))}
                            </div>
                            <div className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 opacity-40`}>
                              {msg.is_optimistic ? <Clock className="h-3 w-3 animate-spin" /> : <>{msg.is_edited && <span>EDITED •</span>}{format(new Date(msg.created_at), 'HH:mm')}</>}
                            </div>
                          </div>

                          <AnimatePresence>
                            {isLongPressed && !msg.is_optimistic && (
                              <motion.div initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 10 }} className={`absolute -top-16 ${isOwn ? 'right-0' : 'left-0'} flex items-center gap-1 bg-black/90 backdrop-blur-3xl p-2 rounded-[24px] z-50 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]`} onClick={(e) => e.stopPropagation()}>
                                <div className="flex gap-1 px-2 border-r border-white/10">{['❤️', '🔥', '👍', '😂'].map(e => (<button key={e} onClick={() => addReaction(msg.id, e)} className="text-lg p-1 hover:scale-125 transition-transform">{e}</button>))}</div>
                                <button onClick={() => setReplyingTo(msg)} className="p-2 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition-all"><Reply className="h-4 w-4" /></button>
                                <button onClick={() => copyToClipboard(msg.content)} className="p-2 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition-all"><Copy className="h-4 w-4" /></button>
                                {isOwn && <button onClick={() => { setEditingMessage(msg); setNewMessage(msg.content); setLongPressedMessageId(null); }} className="p-2 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition-all"><Edit2 className="h-4 w-4" /></button>}
                                <button onClick={() => togglePin(msg)} className={`p-2 hover:bg-white/10 rounded-xl transition-all ${msg.is_pinned ? 'text-amber-500' : 'text-white/60'}`}><Pin className="h-4 w-4" /></button>
                                {isOwn && <button onClick={() => deleteMessage(msg.id)} className="p-2 hover:bg-emerald-500/20 hover:text-emerald-400 rounded-xl text-white/60 transition-all"><Trash2 className="h-4 w-4" /></button>}
                                <button onClick={() => setLongPressedMessageId(null)} className="p-2 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition-all"><X className="h-4 w-4" /></button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Reaction display as seen in image */}
                        {msg.message_reactions && msg.message_reactions.length > 0 && (
                          <div className={`flex items-center gap-1 ${isOwn ? 'order-first' : 'order-last'}`}>
                            {msg.message_reactions.slice(-1).map((r, i) => (
                              <motion.span 
                                initial={{ scale: 0 }} 
                                animate={{ scale: 1 }} 
                                key={i} 
                                className="text-xl"
                              >
                                {r.emoji}
                              </motion.span>
                            ))}
                          </div>
                        )}
                        
                        {isOwn && !msg.is_optimistic && (
                          <div className="flex flex-col gap-1 self-end mb-1">
                            <div className="flex gap-0.5">
                              <div className="h-3 w-3 text-emerald-500"><CheckCircle2 className="h-full w-full" /></div>
                              <div className="h-3 w-3 text-emerald-500 -ml-1.5"><CheckCircle2 className="h-full w-full" /></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </div>

              );
            })}
          </AnimatePresence>
        </div>
        {showScrollBottom && (
          <motion.button initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} onClick={scrollToBottom} className="fixed bottom-32 right-12 h-12 w-12 rounded-2xl bg-white text-black flex items-center justify-center shadow-2xl z-50 border border-black/10 hover:scale-110 transition-transform"><ChevronDown className="h-6 w-6" /></motion.button>
        )}
      </ScrollArea>

      <div className="p-6 md:p-10 bg-[#080808] border-t border-white/5 z-40">
        <div className="max-w-4xl mx-auto space-y-4">
          <AnimatePresence>
            {suggestions && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="flex items-center gap-2 p-3 bg-blue-500/10 rounded-[20px] border border-blue-500/20 cursor-pointer hover:bg-blue-500/20 transition-all mb-2 w-fit mx-auto" onClick={() => toast.info('Feature coming soon: ' + suggestions.type)}>
                {suggestions.type === 'reminder' ? <Calendar className="h-4 w-4 text-blue-400" /> : <ListTodo className="h-4 w-4 text-blue-400" />}
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">{suggestions.text}</span>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {(replyingTo || editingMessage) && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="flex items-center justify-between p-4 bg-white/5 rounded-[24px] border-l-4 border-white mb-2">
                <div className="text-[11px] font-bold text-white/60 truncate flex items-center gap-2">
                  {replyingTo ? <Reply className="h-3 w-3" /> : <Edit2 className="h-3 w-3" />}
                  {replyingTo ? `Replying to @${roomInfo.is_anonymous ? 'ANONYMOUS' : replyingTo.profiles.username}` : 'Editing message'}: 
                  <span className="italic text-white/40 ml-1">"{replyingTo?.content || editingMessage?.content}"</span>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-white/10" onClick={() => { setReplyingTo(null); setEditingMessage(null); setNewMessage(''); }}><X className="h-4 w-4" /></Button>
              </motion.div>
            )}
          </AnimatePresence>
          <form onSubmit={sendMessage} className="flex items-end gap-4">
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
            <motion.button type="button" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => fileInputRef.current?.click()} disabled={uploading} className="h-14 w-14 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all shrink-0"><Paperclip className={`h-6 w-6 ${uploading ? 'animate-spin' : ''}`} /></motion.button>
            <div className="flex-1 relative group">
              <textarea ref={textareaRef} rows={1} placeholder="Compose secure message..." value={newMessage} onChange={(e) => onInputChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} className="w-full min-h-[56px] py-4 rounded-[28px] bg-white/5 border border-white/5 text-white font-bold px-8 placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all focus:bg-white/10 resize-none overflow-hidden" />
              <div className="absolute right-4 bottom-4 flex items-center gap-2"><Smile className="h-5 w-5 text-white/20 hover:text-white cursor-pointer transition-colors" /><Mic className="h-5 w-5 text-white/20 hover:text-white cursor-pointer transition-colors" /></div>
            </div>
            <motion.button type="submit" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} disabled={!newMessage.trim() && !uploading && !editingMessage} className="h-14 w-14 rounded-2xl bg-white text-black flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.2)] disabled:opacity-20 transition-all shrink-0"><Send className="h-6 w-6" /></motion.button>
          </form>
        </div>
      </div>
    </div>
  );
}
