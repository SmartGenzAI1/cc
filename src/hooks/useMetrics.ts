'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';

export function useMetrics() {
  const { user } = useAuth();
  const sessionId = useRef(crypto.randomUUID());
  const [messageCount, setMessageCount] = useState(0);

  const recordMetric = async (type: string, value: number, metadata: any = {}) => {
    if (!user) return;
    await supabase.from('ux_metrics').insert({
      user_id: user.id,
      metric_type: type,
      value: value,
      metadata: metadata,
      session_id: sessionId.current
    });
  };

  const trackMessageSent = async () => {
    if (!user) return;
    
    // Track message count per session
    const newCount = messageCount + 1;
    setMessageCount(newCount);
    await recordMetric('session_messages', newCount, { count: newCount });

    // Track time to first message
    const { data: profile } = await supabase
      .from('profiles')
      .select('created_at, first_message_sent_at')
      .eq('id', user.id)
      .single();

    if (profile && !profile.first_message_sent_at) {
      const now = new Date();
      const createdAt = new Date(profile.created_at);
      const timeToFirstMessage = (now.getTime() - createdAt.getTime()) / 1000; // in seconds

      await supabase.from('profiles').update({ first_message_sent_at: now.toISOString() }).eq('id', user.id);
      await recordMetric('time_to_first_message', timeToFirstMessage);
    }
  };

  const trackReadabilityScroll = async (roomId: string, scrollPercentage: number) => {
    // Only record if it's a significant scroll or end of session
    if (scrollPercentage > 90) {
      await recordMetric('readability_long_chat_completion', scrollPercentage, { room_id: roomId });
    }
  };

  return {
    trackMessageSent,
    trackReadabilityScroll
  };
}
