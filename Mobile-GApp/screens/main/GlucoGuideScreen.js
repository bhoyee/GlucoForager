import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { apiFetch } from '../../utils/api';
import { useAuth } from '../../context/authContext';
import { Colors } from '../../constants/Colors';

const QUICK_PROMPTS = [
  'What can I eat for steady blood sugar today?',
  'Explain why bread can spike glucose.',
  'Give me a lower-carb dinner idea.',
  'What should I ask my doctor about my meals?',
];

const STARTER_MESSAGE = {
  id: 'starter',
  role: 'assistant',
  content:
    'Hi, I am GlucoGuide. Ask me about diabetes-aware food choices, recipes, swaps, meal planning, or daily habits. I cannot diagnose or change medication, but I can help you think through meals.',
};

const cleanGuideText = (value) =>
  String(value || '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\r/g, '')
    .trim();

const formatGuideBlocks = (content) => {
  const lines = cleanGuideText(content)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const blocks = [];
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };

  lines.forEach((line) => {
    const bulletMatch = line.match(/^[-*•]\s+(.+)/);
    const numberedMatch = line.match(/^\d+[.)]\s+(.+)/);
    const headingMatch = line.match(/^#{1,4}\s+(.+)/);
    const colonHeading = line.length <= 48 && /:$/.test(line);
    const inlineLabelMatch = line.match(/^([A-Z][A-Za-z0-9 /&'-]{2,42}):\s+(.+)/);

    if (headingMatch || colonHeading) {
      flushParagraph();
      blocks.push({ type: 'heading', text: cleanGuideText(headingMatch ? headingMatch[1] : line.replace(/:$/, '')) });
      return;
    }

    if (inlineLabelMatch) {
      flushParagraph();
      blocks.push({ type: 'heading', text: cleanGuideText(inlineLabelMatch[1]) });
      blocks.push({ type: 'paragraph', text: cleanGuideText(inlineLabelMatch[2]) });
      return;
    }

    if (bulletMatch || numberedMatch) {
      flushParagraph();
      blocks.push({ type: 'bullet', text: cleanGuideText((bulletMatch || numberedMatch)[1]) });
      return;
    }

    paragraph.push(line);
  });

  flushParagraph();
  return blocks.length ? blocks : [{ type: 'paragraph', text: cleanGuideText(content) }];
};

function GuideAnswer({ content }) {
  const blocks = formatGuideBlocks(content);
  return (
    <View style={styles.answerWrap}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return (
            <Text key={`${block.type}-${index}`} style={styles.answerHeading}>
              {block.text}
            </Text>
          );
        }
        if (block.type === 'bullet') {
          return (
            <View key={`${block.type}-${index}`} style={styles.answerBulletRow}>
              <View style={styles.answerBulletDot} />
              <Text style={styles.answerBulletText}>{block.text}</Text>
            </View>
          );
        }
        return (
          <Text key={`${block.type}-${index}`} style={styles.answerParagraph}>
            {block.text}
          </Text>
        );
      })}
    </View>
  );
}

export default function GlucoGuideScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const [messages, setMessages] = useState([STARTER_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [useProfileContext, setUseProfileContext] = useState(true);
  const [latestActions, setLatestActions] = useState([]);
  const [composerFocused, setComposerFocused] = useState(false);

  const historyForApi = useMemo(
    () =>
      messages
        .filter((item) => item.id !== 'starter')
        .slice(-6)
        .map((item) => ({ role: item.role, content: item.content })),
    [messages]
  );

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd?.({ animated: true });
    });
  };

  const sendMessage = async (overrideText) => {
    const text = String(overrideText || input || '').trim();
    if (!text || loading) return;
    setInput('');
    setLatestActions([]);
    const userMessage = { id: `u-${Date.now()}`, role: 'user', content: text };
    setMessages((current) => [...current, userMessage]);
    setLoading(true);
    scrollToEnd();

    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setMessages((current) => [
          ...current,
          { id: `a-${Date.now()}`, role: 'assistant', content: 'Please sign in to use GlucoGuide.' },
        ]);
        return;
      }
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.AGENT_CHAT}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            history: historyForApi,
            use_profile_context: useProfileContext,
          }),
        },
        { onUnauthorized: signOut, timeoutMs: 45000 }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data?.detail?.message || data?.detail || 'GlucoGuide is unavailable right now. Please try again.';
        setMessages((current) => [...current, { id: `a-${Date.now()}`, role: 'assistant', content: String(detail) }]);
        return;
      }
      setLatestActions(Array.isArray(data?.actions) ? data.actions : []);
      setMessages((current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: data?.answer || 'I could not generate a helpful answer. Please try again.',
        },
      ]);
    } finally {
      setLoading(false);
      scrollToEnd();
    }
  };

  const handleAction = (action) => {
    if (!action || !action.target) return;
    if (action.target === 'composer') {
      setComposerFocused(true);
      scrollToEnd();
      setTimeout(() => {
        inputRef.current?.focus?.();
      }, 80);
      return;
    }
    if (action.kind === 'tab' && action.target === 'DailyPlan') {
      const routes = navigation.getState?.()?.routeNames || [];
      if (routes.includes('DailyPlan')) {
        navigation.navigate('DailyPlan');
      } else {
        navigation.navigate('Profile', { screen: 'ProfileMain', params: { openPremium: true } });
      }
      return;
    }
    navigation.navigate('Home', { screen: action.target });
  };

  return (
      <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 76}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={[styles.messagesContent, { paddingBottom: 26 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 14) + 8 }]}>
          <View style={styles.headerIcon}>
            <Ionicons name="sparkles-outline" size={20} color="white" />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>GlucoGuide AI</Text>
            <Text style={styles.headerSubtitle}>Diabetes-aware food and lifestyle support</Text>
          </View>
          <View style={styles.headerBadge}>
            <Ionicons name="shield-checkmark-outline" size={15} color="#B9F6CA" />
            <Text style={styles.headerBadgeText}>Safe</Text>
          </View>
        </View>

        {messages.map((item) => (
          <View key={item.id} style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
            {item.role === 'assistant' ? (
              <GuideAnswer content={item.content} />
            ) : (
              <Text style={[styles.bubbleText, styles.userBubbleText]}>{item.content}</Text>
            )}
          </View>
        ))}

        {loading ? (
          <View style={[styles.bubble, styles.assistantBubble, styles.loadingBubble]}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.loadingText}>Thinking...</Text>
          </View>
        ) : null}

        {!loading && latestActions.length ? (
          <View style={styles.actionsRow}>
            {latestActions.map((action) => (
              <Pressable
                key={`${action.label}-${action.target}`}
                style={[
                  styles.actionChip,
                  action.target === 'ManualInput' ? styles.actionChipRecipes : null,
                  action.target === 'CarbSwaps' ? styles.actionChipSwaps : null,
                  action.target === 'DailyPlan' ? styles.actionChipPlan : null,
                  action.target === 'composer' ? styles.actionChipComposer : null,
                ]}
                onPress={() => handleAction(action)}
              >
                <Text
                  style={[
                    styles.actionChipText,
                    action.target === 'composer' ? styles.actionChipTextDark : styles.actionChipTextLight,
                  ]}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {!composerFocused ? (
        <View style={styles.quickWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
            {QUICK_PROMPTS.map((prompt) => (
              <Pressable key={prompt} style={styles.quickChip} onPress={() => sendMessage(prompt)}>
                <Text style={styles.quickChipText}>{prompt}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View
        style={[
          styles.composerWrap,
          composerFocused ? styles.composerWrapFocused : null,
          { paddingBottom: composerFocused ? 10 : Math.max(insets.bottom + 8, 14) },
        ]}
      >
        <View style={[styles.composerCard, composerFocused ? styles.composerCardFocused : null]}>
          {composerFocused ? (
            <View style={styles.composerTopRow}>
              <Pressable
                style={[styles.contextToggle, useProfileContext ? styles.contextToggleActive : null]}
                onPress={() => setUseProfileContext((value) => !value)}
              >
                <Ionicons
                  name={useProfileContext ? 'person-circle' : 'person-circle-outline'}
                  size={16}
                  color={useProfileContext ? 'white' : Colors.primary}
                />
                <Text style={[styles.contextToggleText, useProfileContext ? styles.contextToggleTextActive : null]}>
                  Use profile
                </Text>
              </Pressable>
              <Pressable style={styles.dismissKeyboardButton} onPress={Keyboard.dismiss}>
                <Ionicons name="chevron-down" size={18} color={Colors.textLight} />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.composer}>
            <TextInput
              ref={inputRef}
              value={input}
              onChangeText={setInput}
            placeholder="Ask about food, recipes, swaps..."
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
            multiline
            maxLength={1200}
            textAlignVertical="top"
            blurOnSubmit={false}
            onFocus={() => {
              setComposerFocused(true);
              scrollToEnd();
              }}
              onBlur={() => setComposerFocused(false)}
            />
            <Pressable style={[styles.sendButton, (!input.trim() || loading) ? styles.sendButtonDisabled : null]} onPress={() => sendMessage()}>
              <Ionicons name="send" size={18} color="white" />
            </Pressable>
          </View>
          {composerFocused ? (
            <Text style={styles.safetyText}>Food and lifestyle support only. For medication, diagnosis, or urgent symptoms, contact a clinician.</Text>
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F7F4',
  },
  header: {
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: 20,
    paddingBottom: 22,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: -16,
    marginTop: -20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: '900',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.78)',
    marginTop: 4,
    fontWeight: '600',
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  headerBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '900',
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingTop: 20,
    gap: 11,
  },
  bubble: {
    maxWidth: '88%',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.primaryDark,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
  },
  assistantBubbleText: {
    color: Colors.text,
  },
  userBubbleText: {
    color: 'white',
    fontWeight: '650',
  },
  answerWrap: {
    gap: 7,
  },
  answerHeading: {
    color: Colors.primaryDark,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  answerParagraph: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  answerBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  answerBulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
    marginTop: 8,
  },
  answerBulletText: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: Colors.textLight,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  actionChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  actionChipRecipes: {
    backgroundColor: Colors.primaryDark,
  },
  actionChipSwaps: {
    backgroundColor: Colors.secondary,
  },
  actionChipPlan: {
    backgroundColor: '#B45309',
  },
  actionChipComposer: {
    backgroundColor: '#EEF2F7',
    borderWidth: 1,
    borderColor: '#D9E2EC',
  },
  actionChipText: {
    fontWeight: '800',
    fontSize: 12,
  },
  actionChipTextLight: {
    color: 'white',
  },
  actionChipTextDark: {
    color: Colors.text,
  },
  quickWrap: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: '#F9FCFA',
  },
  quickRow: {
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  quickChip: {
    maxWidth: 230,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickChipText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  composerWrap: {
    backgroundColor: '#F9FCFA',
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  composerWrapFocused: {
    paddingTop: 8,
  },
  composerCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  composerCardFocused: {
    borderRadius: 22,
    padding: 10,
    shadowOpacity: 0.10,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  composerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  contextToggle: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#E7F4EE',
  },
  contextToggleActive: {
    backgroundColor: Colors.primary,
  },
  contextToggleText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  contextToggleTextActive: {
    color: 'white',
  },
  dismissKeyboardButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 44,
    borderRadius: 16,
    backgroundColor: '#F7FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: Colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  safetyText: {
    color: Colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 8,
  },
});
