import {
  Component, signal, ElementRef, ViewChild,
  AfterViewChecked
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { OfflineQueueService } from '../../services/offline-queue.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';  

type Mode = 'menu' | 'register' | 'track' | 'faq';
type Step = 'description' | 'location' | 'confirm_location' | 'priority' | 'confirm';

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
  imports: [CommonModule, FormsModule,TranslateModule],
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

  //location
  locationReady = false;
  locationStatus = '';
  latitude: number | null = null;
  longitude: number | null = null;

  // Registration state
  step: Step = 'description';
  form = {
    title: '', description: '', location: '',
    priority: 'LOW', department: ''
  };
  suggestionConfirmed = false;

  //offline
  isOffline = false;
  syncMessage = '';

  private readonly BASE = 'http://localhost:8080/api/chatbot';

  constructor(private http: HttpClient, private offlineQueue: OfflineQueueService,private translate: TranslateService) {
    this.initVoice();
    const savedLang = localStorage.getItem('lang') ?? 'en';
    this.translate.use(savedLang);
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
    this.watchNetworkStatus();
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

  private t(key: string): string {
    return this.translate.instant(key);
  }

  toggle() {
    this.isOpen.update(v => !v);
    if (this.isOpen() && this.messages().length === 0) this.showMenu();
  }

  showMenu() {
    this.mode = 'menu';
    this.step = 'description';
    this.latitude = null;
    this.longitude = null;
    this.locationReady = false;
    this.locationStatus = '';
    this.form = { title: '', description: '', location: '',
                  priority: 'LOW', department: '' };
    this.suggestionConfirmed = false;
    this.bot(this.t('chatbot.menu_greeting'));
  }

  selectMode(mode: Mode) {
    this.mode = mode;
    if (mode === 'register') {
      this.step = 'description';
      this.bot(this.t('chatbot.register.intro'));
    } else if (mode === 'track') {
      this.bot(this.t('chatbot.track.intro'));
    } else if (mode === 'faq') {
      this.bot(this.t('chatbot.faq.intro'));
    }
  }

  private detectLocation(): Promise<void> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        this.bot(this.t('chatbot.register.locationManual'));
        this.step = 'location';
        resolve(); return;
      }
      this.bot(this.t('chatbot.register.detecting'));
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.latitude       = pos.coords.latitude;
          this.longitude      = pos.coords.longitude;
          this.locationReady  = true;
          this.locationStatus = `${this.latitude.toFixed(5)}, ${this.longitude.toFixed(5)}`;
          this.bot(
            `${this.t('chatbot.register.locationDetected')}: ${this.locationStatus}\n` +
            this.t('chatbot.register.locationConfirm')
          );
          this.step = 'confirm_location' as any;
          resolve();
        },
        (err) => {
          console.error('Geolocation error:', err.code);
          const reasons: Record<number, string> = {
            1: this.t('chatbot.register.locationPermission'),
            2: this.t('chatbot.register.locationUnavailable'),
            3: this.t('chatbot.register.locationTimeout')
          };
          if (err.code === 2) {
            this.bot(this.t('chatbot.register.locationFallback'));
            this.http.get<any>('https://ipapi.co/json/').subscribe({
              next: (res) => {
                this.latitude       = res.latitude;
                this.longitude      = res.longitude;
                this.locationReady  = true;
                this.locationStatus = `${res.city}, ${res.region}`;
                this.bot(
                  `${this.t('chatbot.register.locationDetected')}: ${this.locationStatus}\n` +
                  this.t('chatbot.register.locationConfirm')
                );
                this.step = 'confirm_location' as any;
              },
              error: () => {
                this.bot(this.t('chatbot.register.locationManual'));
                this.step = 'location';
              }
            });
            resolve(); return;
          }
          this.bot(`⚠️ ${reasons[err.code] ?? ''} ${this.t('chatbot.register.locationManual')}`);
          this.locationReady = false;
          this.step = 'location';
          resolve();
        },
        { timeout: 15000, enableHighAccuracy: false, maximumAge: 60000 }
      );
    });
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
        this.form.title       = text.slice(0, 60);
        this.isLoading        = true;
        this.http.get<any>(
          `${this.BASE}/suggest-department?text=${encodeURIComponent(text)}`
        ).subscribe({
          next: (res) => {
            this.isLoading       = false;
            this.form.department = res.department;
            this.form.priority   = res.priority;
            const msg = res.conflict
              ? this.t('chatbot.register.conflict')
              : res.sensitiveLocation
                ? `${this.t('chatbot.register.sensitive')}: ${res.sensitiveLocation}. ${this.t('chatbot.register.priorityUpgraded')}`
                : this.t('chatbot.register.analyzed');
            this.bot(msg, undefined, {
              department:        res.department,
              priority:          res.priority,
              confidence:        res.confidence,
              conflict:          res.conflict,
              sensitiveLocation: res.sensitiveLocation
            });
          },
          error: () => {
            this.isLoading = false;
            this.bot(this.t('chatbot.register.autoDetectFailed'));
            this.step = 'location';
          }
        });
        break;

      case 'confirm_location' as any:
        if (text.toUpperCase() === 'YES') {
          this.form.location = this.locationStatus;
          this.bot(this.t('chatbot.register.locationLandmark'));
          this.step = 'location';
        } else {
          this.latitude = null; this.longitude = null;
          this.locationReady = false;
          this.bot(this.t('chatbot.register.locationManual'));
          this.step = 'location';
        }
        break;

      case 'location':
        if (this.locationReady && this.form.location) {
          this.form.location = text
            ? `${this.form.location} (${text})`
            : this.form.location;
        } else {
          this.form.location = text;
        }
        this.step = 'confirm';
        this.showConfirmSummary();
        break;

      case 'priority':
        const p = text.toUpperCase();
        if (!['LOW','MEDIUM','HIGH','EMERGENCY'].includes(p)) {
          this.bot(this.t('chatbot.register.invalidPriority'));
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
          this.bot(this.t('chatbot.register.cancelled'));
          setTimeout(() => this.showMenu(), 1500);
        } else {
          this.bot(this.t('chatbot.register.yesNo'));
        }
        break;
    }
  }

  confirmSuggestion(accepted: boolean) {
    if (accepted) {
      this.suggestionConfirmed = true;
      this.detectLocation();
    } else {
      this.bot(this.t('chatbot.register.editPriority'));
      this.step = 'priority';
    }
  }

  private showConfirmSummary() {
    const locationLine = this.locationReady
      ? `${this.t('chatbot.register.summaryLocation')}: ${this.form.location} (${this.t('chatbot.register.summaryGps')})`
      : `${this.t('chatbot.register.summaryLocation')}: ${this.form.location}`;
    this.bot(
      `${this.t('chatbot.register.summary')}\n` +
      `${this.t('chatbot.register.summaryDescription')}: ${this.form.description}\n` +
      `${locationLine}\n` +
      `${this.t('chatbot.register.summaryDepartment')}: ${this.form.department}\n` +
      `${this.t('chatbot.register.summaryPriority')}: ${this.form.priority}\n\n` +
      this.t('chatbot.register.confirm')
    );
  }
  private submitComplaint() {
    if (this.offlineQueue.isOffline()) {
      this.offlineQueue.add({
        title: this.form.title, description: this.form.description,
        location: this.form.location, department: this.form.department,
        priority: this.form.priority, latitude: this.latitude, longitude: this.longitude
      });
      this.bot(this.t('chatbot.register.savedOffline'));
      setTimeout(() => this.showMenu(), 2500);
      return;
    }
    this.isLoading = true;
    this.http.post<any>(`${this.BASE}/submit-complaint`, {
      title: this.form.title, description: this.form.description,
      location: this.form.location, department: this.form.department,
      priority: this.form.priority, latitude: this.latitude, longitude: this.longitude
    }, { headers: this.headers }).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.bot(`${this.t('chatbot.register.submitSuccess')} #${res.id} | ${res.department}`);
        setTimeout(() => this.showMenu(), 2500);
      },
      error: () => {
        this.isLoading = false;
        this.offlineQueue.add({
          title: this.form.title, description: this.form.description,
          location: this.form.location, department: this.form.department,
          priority: this.form.priority, latitude: this.latitude, longitude: this.longitude
        });
        this.bot(this.t('chatbot.register.savedFallback'));
        setTimeout(() => this.showMenu(), 2500);
      }
    });
  }
  // ── Track flow ─────────────────────────────────────────────────

  private handleTrack(text: string) {
    const id = text.replace(/[^0-9]/g, '');
    if (!id) { this.bot(this.t('chatbot.track.invalidId')); return; }
    this.isLoading = true;
    this.http.get<any>(`${this.BASE}/status/${id}`, { headers: this.headers }).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.bot(this.t('chatbot.track.status'), {
          id: res.id, title: res.title, status: res.status,
          priority: res.priority, department: res.department,
          assignedOfficer: res.assignedOfficer, escalated: res.escalated
        });
        setTimeout(() => this.bot(this.t('chatbot.track.another')), 500);
      },
      error: (err) => {
        this.isLoading = false;
        this.bot(err.status === 404
          ? `${this.t('chatbot.track.notFound')} ${id}.`
          : this.t('chatbot.track.failed'));
      }
    });
  }
  // ── FAQ flow ───────────────────────────────────────────────────

  private handleFaq(text: string) {
    this.isLoading = true;
    this.http.get<any>(`${this.BASE}/faq?query=${encodeURIComponent(text)}`).subscribe({
      next: (res) => { this.isLoading = false; this.bot(res.answer); },
      error: () => { this.isLoading = false; this.bot(this.t('chatbot.faq.failed')); }
    });
  }

  // ── Voice ──────────────────────────────────────────────────────

  private initVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    this.recognition = new SR();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event: any) => {
  let interim = '', final = '';
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const t = event.results[i][0].transcript;
    if (event.results[i].isFinal) final += t;
    else interim += t;
  }

  this.liveTranscript = interim || final;

  if (final) {
    const confidence = event.results[event.results.length - 1][0].confidence ?? 1;

    if (confidence < 0.3) {
      this.bot(`🤔 ${final}`);
      this.isListening = false;
      return;
    }

    // Keyword map translation — synchronous, no API call
    let processedText = final;
    if (this.voiceLang === 'ta-IN') {
      processedText = this.translateToEnglish(final);
    }

    this.input       = processedText;
    this.isListening = false;
    this.send();
  }
};
    this.recognition.onerror = (event: any) => {
      console.error('Voice error:', event.error);
      this.isListening = false; this.liveTranscript = '';
      const map: Record<string, string> = {
        'not-allowed':  this.t('chatbot.voice.permissionDenied'),
        'no-speech':    this.t('chatbot.voice.noSpeech'),
        'network':      this.t('chatbot.voice.network'),
        'aborted':      this.t('chatbot.voice.aborted'),
        'audio-capture': this.t('chatbot.voice.noMic')
      };
      this.bot(map[event.error] ?? this.t('chatbot.voice.failed'));
    };

    this.recognition.onend = () => { this.isListening = false; };
  }

  

  private readonly TAMIL_KEYWORD_MAP: Record<string, string> = {
  // Water
  'நீர்': 'water', 'குழாய்': 'pipe', 'கசிவு': 'leakage',
  'வெள்ளம்': 'flood', 'கழிவு நீர்': 'sewage', 'வடிகால்': 'drain',
  // Electricity  
  'மின்சாரம்': 'electricity', 'விளக்கு': 'light', 'மின்வெட்டு': 'power outage',
  'கம்பி': 'wire', 'தெரு விளக்கு': 'streetlight',
  // Road
  'சாலை': 'road', 'குழி': 'pothole', 'நடைபாதை': 'footpath',
  'உடைந்த': 'broken', 'சேதம்': 'damaged',
  // Sanitation
  'குப்பை': 'garbage', 'கழிவு': 'waste', 'துப்புரவு': 'sanitation',
  'அழுக்கு': 'dirty', 'துர்நாற்றம்': 'smell',
  // Sensitive locations
  'பள்ளி': 'school', 'மருத்துவமனை': 'hospital',
  'கல்லூரி': 'college', 'பேருந்து நிலையம்': 'bus stand',
  'சந்தை': 'market', 'கோயில்': 'temple',
  // Common descriptors
  'அவசரம்': 'emergency', 'உடனடி': 'urgent',
  'பெரிய': 'large', 'சிறிய': 'small', 'அருகே': 'near'
};

private translateToEnglish(text: string): string {
  let result = text.toLowerCase();
  const entries = Object.entries(this.TAMIL_KEYWORD_MAP)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [tamil, english] of entries) {
    result = result.replaceAll(tamil, english);
  }
  return result;
}
 toggleVoice() {
  if (!this.recognition) {
    this.bot(this.t('chatbot.voice.unsupported'));
    return;
  }
  if (this.isListening) {
    this.recognition.stop();
    this.isListening = false;
  } else {
    setTimeout(() => {
      this.recognition.lang = this.voiceLang;
      this.recognition.start();
      this.isListening    = true;
      this.liveTranscript = '';
    }, 100);
  }
}

  toggleVoiceLang() {
  this.voiceLang = this.voiceLang === 'en-IN' ? 'ta-IN' : 'en-IN';
  // Recognition lang matches voice lang
  // but output is always translated to English before storing
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

  //offline complaint submisso=ion
private watchNetworkStatus() {
  this.isOffline = !navigator.onLine;

  window.addEventListener('online', () => {
    this.isOffline = false;
    this.syncPending();
  });

  window.addEventListener('offline', () => {
    this.isOffline = true;
  });
}

private syncPending() {
    const count = this.offlineQueue.pendingCount;
    if (count === 0) return;
    this.bot(`${this.t('chatbot.sync.back')} ${count} ${this.t('chatbot.sync.pending')}`);
    this.offlineQueue.syncAll().then(result => {
      if (result.success > 0)
        this.bot(`✅ ${result.success} ${this.t('chatbot.sync.success')}`);
      if (result.failed > 0)
        this.bot(`⚠️ ${result.failed} ${this.t('chatbot.sync.failed')}`);
    });
  }

get pendingCount() {
  return this.offlineQueue.pendingCount;
}

  back() { this.showMenu(); }
}