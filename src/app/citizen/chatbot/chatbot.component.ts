import {
  Component, signal, ElementRef, ViewChild,
  AfterViewChecked
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';

type Mode = 'menu' | 'register' | 'track' | 'faq';
type Step = 'description' | 'location' | 'priority' | 'confirm';

interface Message {
  from: 'bot' | 'user';
  text: string;
  card?: StatusCard;
  suggestion?: SuggestionCard;
}

interface StatusCard {
  id: number;
  title: string;
  status: string;
  priority: string;
  department: string;
  assignedOfficer: string;
  escalated: boolean;
}

interface SuggestionCard {
  department: string;
  priority: string;
  confidence: number;
  conflict: boolean;
  sensitiveLocation: string | null;
}

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.css']
})
export class ChatbotComponent implements AfterViewChecked {

  @ViewChild('msgContainer') private msgContainer!: ElementRef;

  isOpen = signal(false);
  messages = signal<Message[]>([]);
  input = '';
  mode: Mode = 'menu';
  isLoading = false;

  // Voice
  isListening = false;
  liveTranscript = '';
  voiceLang = 'en-IN';
  private recognition: any = null;
  isVoiceConfirming = false;

  // Registration state
  step: Step = 'description';
  form = {
    title: '', description: '', location: '',
    priority: 'LOW', department: ''
  };
  suggestionConfirmed = false;

  private readonly BASE = 'http://localhost:8080/api/chatbot';

  constructor(private http: HttpClient) {
    this.initVoice();
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  private scrollToBottom() {
    try {
      this.msgContainer.nativeElement.scrollTop =
        this.msgContainer.nativeElement.scrollHeight;
    } catch { }
  }

  private get headers() {
    return new HttpHeaders({
      Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`
    });
  }

  private push(msg: Message) {
    this.messages.update(m => [...m, msg]);
  }

  private bot(text: string, card?: StatusCard, suggestion?: SuggestionCard) {
    this.push({ from: 'bot', text, card, suggestion });
  }

  private user(text: string) {
    this.push({ from: 'user', text });
  }

  toggle() {
    this.isOpen.update(v => !v);
    if (this.isOpen() && this.messages().length === 0) this.showMenu();
  }

  showMenu() {
    this.mode = 'menu';
    this.step = 'description';
    this.form = {
      title: '', description: '', location: '',
      priority: 'LOW', department: ''
    };
    this.suggestionConfirmed = false;
    this.bot('👋 Hi! I am CivicBot. How can I help you today?');
  }

  selectMode(mode: Mode) {
    this.mode = mode;
    if (mode === 'register') {
      this.step = 'description';
      this.bot(
        '📋 Describe your complaint in detail.\n' +
        'You can type or use the 🎤 mic button to speak.\n\n' +
        'Example: "Water leakage near the school on main road"'
      );
    } else if (mode === 'track') {
      this.bot('🔍 Enter your complaint ID number (e.g. 101)');
    } else if (mode === 'faq') {
      this.bot('❓ Ask me anything about our services!');
    }
  }

  send() {
    const text = this.input.trim();
    if (!text) return;

    this.input = '';
    this.liveTranscript = '';
    this.user(text);

    // ✅ HANDLE VOICE CONFIRM
    if (this.isVoiceConfirming) {
      this.isVoiceConfirming = false;

      if (text.toUpperCase() === 'YES') {
        // Continue normal flow
        if (this.mode === 'register') this.handleRegister(this.form.description || text);
        return;
      }

      if (text.toUpperCase() === 'NO') {
        this.bot('❌ Okay, please speak or type again.');
        return;
      }

      this.bot('Please reply YES or NO.');
      this.isVoiceConfirming = true;
      return;
    }

    // Normal flow
    if (this.mode === 'register') this.handleRegister(text);
    else if (this.mode === 'track') this.handleTrack(text);
    else if (this.mode === 'faq') this.handleFaq(text);
  }

  // ── Registration flow ──────────────────────────────────────────

  private handleRegister(text: string) {
    switch (this.step) {

      case 'description':
        this.form.description = text;
        this.form.title = text.slice(0, 60);
        this.isLoading = true;

        this.http.get<any>(
          `${this.BASE}/suggest-department?text=${encodeURIComponent(text)}`
        ).subscribe({
          next: (res) => {
            this.isLoading = false;
            this.form.department = res.department;
            this.form.priority = res.priority;

            const msg = res.conflict
              ? '⚠️ Multiple departments detected. Please confirm the suggestion below.'
              : res.sensitiveLocation
                ? `🚨 Sensitive location detected: ${res.sensitiveLocation}. Priority upgraded.`
                : '✅ I analyzed your complaint. Please confirm the details below.';

            this.bot(msg, undefined, {
              department: res.department,
              priority: res.priority,
              confidence: res.confidence,
              conflict: res.conflict,
              sensitiveLocation: res.sensitiveLocation
            });
          },
          error: () => {
            this.isLoading = false;
            this.bot('Could not auto-detect. Please type the location next.');
            this.step = 'location';
          }
        });
        break;

      case 'location':
        this.form.location = text;
        this.step = 'confirm';
        this.showConfirmSummary();
        break;

      case 'priority':
        const p = text.toUpperCase();
        if (!['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'].includes(p)) {
          this.bot('Please type: LOW, MEDIUM, HIGH, or EMERGENCY');
          return;
        }
        this.form.priority = p;
        this.step = 'confirm';
        this.showConfirmSummary();
        break;

      case 'confirm':
        if (text.toUpperCase() === 'YES') {
          this.submitComplaint();
        } else if (text.toUpperCase() === 'NO') {
          this.bot('❌ Cancelled. Returning to menu...');
          setTimeout(() => this.showMenu(), 1500);
        } else {
          this.bot('Please type YES to submit or NO to cancel.');
        }
        break;
    }
  }

  confirmSuggestion(accepted: boolean) {
    if (accepted) {
      this.suggestionConfirmed = true;
      this.bot('📍 Where is the issue located?');
      this.step = 'location';
    } else {
      this.bot('No problem. What priority should this be? (LOW / MEDIUM / HIGH / EMERGENCY)');
      this.step = 'priority';
    }
  }

  private showConfirmSummary() {
    this.bot(
      `📋 Complaint summary:\n` +
      `• Description: ${this.form.description}\n` +
      `• Location: ${this.form.location}\n` +
      `• Department: ${this.form.department}\n` +
      `• Priority: ${this.form.priority}\n\n` +
      `Type YES to submit or NO to cancel.`
    );
  }

  private submitComplaint() {
    this.isLoading = true;
    this.http.post<any>(
      `${this.BASE}/submit-complaint`,
      this.form,
      { headers: this.headers }
    ).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.bot(`✅ Complaint #${res.id} filed! Status: ${res.status} | Dept: ${res.department}`);
        setTimeout(() => this.showMenu(), 2500);
      },
      error: () => {
        this.isLoading = false;
        this.bot('❌ Submission failed. Please try again.');
      }
    });
  }

  // ── Track flow ─────────────────────────────────────────────────

  private handleTrack(text: string) {
    const id = text.replace(/[^0-9]/g, '');
    if (!id) { this.bot('Please enter a valid complaint ID.'); return; }
    this.isLoading = true;
    this.http.get<any>(
      `${this.BASE}/status/${id}`,
      { headers: this.headers }
    ).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.bot('Here is your complaint status:', {
          id: res.id,
          title: res.title,
          status: res.status,
          priority: res.priority,
          department: res.department,
          assignedOfficer: res.assignedOfficer,
          escalated: res.escalated
        });
        setTimeout(() => {
          this.bot('Would you like to track another complaint?');
        }, 500);
      },
      error: (err) => {
        this.isLoading = false;
        this.bot(err.status === 404
          ? `No complaint found with ID ${id}.`
          : 'Could not fetch status. Please try again.');
      }
    });
  }

  // ── FAQ flow ───────────────────────────────────────────────────

  private handleFaq(text: string) {
    this.isLoading = true;
    this.http.get<any>(
      `${this.BASE}/faq?query=${encodeURIComponent(text)}`
    ).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.bot(res.answer);
      },
      error: () => {
        this.isLoading = false;
        this.bot('Sorry, I could not find an answer right now.');
      }
    });
  }

  // ── Voice ──────────────────────────────────────────────────────

  private initVoice() {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;

    this.recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }

      this.liveTranscript = interim || final;

      if (final) {
        // ✅ ALWAYS use last result
        const result = event.results[event.results.length - 1][0];
        const confidence = result.confidence ?? 1;

        // ✅ Store description properly
        this.form.description = final;
        this.form.title = final.slice(0, 60);

        if (confidence < 0.3) {
          this.bot(`🤔 I heard: "${final}". Is this correct? (YES/NO)`);
          this.input = final;
          this.isVoiceConfirming = true;
          this.isListening = false;
          return;
        }

        // ✅ Direct success flow
        this.input = final;
        this.isListening = false;

        // 🔥 OPTIONAL: auto-send (recommended)
        this.send();
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error('Voice error:', event.error, event.message);
      this.isListening = false;
      this.liveTranscript = '';

      const errorMessages: Record<string, string> = {
        'not-allowed': 'Microphone permission denied. Please allow mic access.',
        'no-speech': 'No speech detected. Please try again.',
        'network': 'Network error. Check your connection.',
        'aborted': 'Voice input cancelled.',
        'audio-capture': 'No microphone found.',
        'service-not-allowed': 'Speech service blocked. Use HTTPS or localhost.',
      };

      const msg = errorMessages[event.error] ?? `Voice error: ${event.error}`;
      this.bot(msg);
    };

    this.recognition.onend = () => {
      this.isListening = false;
    };
  }

  toggleVoice() {
    if (!this.recognition) {
      this.bot('Voice input is not supported in your browser.');
      return;
    }
    if (this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    } else {
      this.recognition.lang = this.voiceLang;
      this.recognition.start();
      this.isListening = true;
      this.liveTranscript = '';
    }
  }

  toggleVoiceLang() {
    this.voiceLang = this.voiceLang === 'en-IN' ? 'ta-IN' : 'en-IN';
    if (this.isListening) {
      this.recognition.stop();
      setTimeout(() => {
        this.recognition.lang = this.voiceLang;
        this.recognition.start();
      }, 300);
    }
  }

  get voiceLangLabel() {
    return this.voiceLang === 'en-IN' ? 'EN' : 'தமிழ்';
  }

  back() { this.showMenu(); }
}