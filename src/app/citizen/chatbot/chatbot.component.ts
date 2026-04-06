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
  imports: [CommonModule, FormsModule, TranslateModule],
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

  isListening = false;
  liveTranscript = '';
  voiceLang = 'en-IN';
  private recognition: any = null;
  isVoiceConfirming = false;

  locationReady = false;
  locationStatus = '';
  latitude: number | null = null;
  longitude: number | null = null;

  step: Step = 'description';
  form = { title: '', description: '', location: '', priority: 'LOW', department: '' };
  suggestionConfirmed = false;

  isOffline = false;
  syncMessage = '';

  private readonly BASE = 'http://localhost:8080/api/chatbot';

  constructor(
    private readonly http: HttpClient,
    private readonly offlineQueue: OfflineQueueService,
    private readonly translate: TranslateService
  ) {
    this.initVoice();
    this.translate.use(localStorage.getItem('lang') ?? 'en');
  }

  ngAfterViewChecked(): void {
    this.scrollToBottom();
    this.watchNetworkStatus();
  }

  private scrollToBottom(): void {
    try {
      this.msgContainer.nativeElement.scrollTop = this.msgContainer.nativeElement.scrollHeight;
    } catch { }
  }

  private get headers(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` });
  }

  private push(msg: Message): void { this.messages.update(m => [...m, msg]); }
  private bot(text: string, card?: StatusCard, suggestion?: SuggestionCard): void {
    this.push({ from: 'bot', text, card, suggestion });
  }
  private user(text: string): void { this.push({ from: 'user', text }); }
  private t(key: string): string { return this.translate.instant(key); }

  toggle(): void {
    this.isOpen.update(v => !v);
    if (this.isOpen() && this.messages().length === 0) { this.showMenu(); }
  }

  showMenu(): void {
    this.mode = 'menu';
    this.step = 'description';
    this.latitude = null; this.longitude = null;
    this.locationReady = false; this.locationStatus = '';
    this.form = { title: '', description: '', location: '', priority: 'LOW', department: '' };
    this.suggestionConfirmed = false;
    this.bot(this.t('chatbot.menu_greeting'));
  }

  selectMode(mode: Mode): void {
    this.mode = mode;
    if (mode === 'register') { this.step = 'description'; this.bot(this.t('chatbot.register.intro')); }
    else if (mode === 'track') { this.bot(this.t('chatbot.track.intro')); }
    else if (mode === 'faq')   { this.bot(this.t('chatbot.faq.intro')); }
  }

  private detectLocation(): Promise<void> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        this.bot(this.t('chatbot.register.locationManual'));
        this.step = 'location'; resolve(); return;
      }
      this.bot(this.t('chatbot.register.detecting'));
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.latitude = pos.coords.latitude; this.longitude = pos.coords.longitude;
          this.locationReady = true;
          this.locationStatus = `${this.latitude.toFixed(5)}, ${this.longitude.toFixed(5)}`;
          this.bot(`${this.t('chatbot.register.locationDetected')}: ${this.locationStatus}\n${this.t('chatbot.register.locationConfirm')}`);
          this.step = 'confirm_location' as Step; resolve();
        },
        (err) => {
          const reasons: Record<number, string> = {
            1: this.t('chatbot.register.locationPermission'),
            2: this.t('chatbot.register.locationUnavailable'),
            3: this.t('chatbot.register.locationTimeout')
          };
          if (err.code === 2) {
            this.bot(this.t('chatbot.register.locationFallback'));
            this.http.get<{ latitude: number; longitude: number; city: string; region: string }>(
              'https://ipapi.co/json/'
            ).subscribe({
              next: (res) => {
                this.latitude = res.latitude; this.longitude = res.longitude;
                this.locationReady = true;
                this.locationStatus = `${res.city}, ${res.region}`;
                this.bot(`${this.t('chatbot.register.locationDetected')}: ${this.locationStatus}\n${this.t('chatbot.register.locationConfirm')}`);
                this.step = 'confirm_location' as Step;
              },
              error: () => { this.bot(this.t('chatbot.register.locationManual')); this.step = 'location'; }
            });
            resolve(); return;
          }
          this.bot(`⚠️ ${reasons[err.code] ?? ''} ${this.t('chatbot.register.locationManual')}`);
          this.locationReady = false; this.step = 'location'; resolve();
        },
        { timeout: 15000, enableHighAccuracy: false, maximumAge: 60000 }
      );
    });
  }

  send(): void {
    const text = this.input.trim();
    if (!text) { return; }
    this.input = ''; this.liveTranscript = '';
    this.user(text);

    if (this.isVoiceConfirming) {
      this.isVoiceConfirming = false;
      if (text.toUpperCase() === 'YES') {
        if (this.mode === 'register') { this.handleRegister(this.form.description || text); }
        return;
      }
      if (text.toUpperCase() === 'NO') { this.bot('❌ Okay, please speak or type again.'); return; }
      this.bot('Please reply YES or NO.'); this.isVoiceConfirming = true; return;
    }

    if (this.mode === 'register')   { this.handleRegister(text); }
    else if (this.mode === 'track') { this.handleTrack(text); }
    else if (this.mode === 'faq')   { this.handleFaq(text); }
  }

  private handleRegister(text: string): void {
    switch (this.step) {
      case 'description':
        this.form.description = text; this.form.title = text.slice(0, 60);
        this.isLoading = true;
        this.http.get<{
          department: string; priority: string;
          confidence: number; conflict: boolean; sensitiveLocation: string | null;
        }>(`${this.BASE}/suggest-department?text=${encodeURIComponent(text)}`).subscribe({
          next: (res) => {
            this.isLoading = false; this.form.department = res.department; this.form.priority = res.priority;
            const msg = res.conflict
              ? this.t('chatbot.register.conflict')
              : res.sensitiveLocation
                ? `${this.t('chatbot.register.sensitive')}: ${res.sensitiveLocation}. ${this.t('chatbot.register.priorityUpgraded')}`
                : this.t('chatbot.register.analyzed');
            this.bot(msg, undefined, { department: res.department, priority: res.priority, confidence: res.confidence, conflict: res.conflict, sensitiveLocation: res.sensitiveLocation });
          },
          error: () => { this.isLoading = false; this.bot(this.t('chatbot.register.autoDetectFailed')); this.step = 'location'; }
        });
        break;

      case 'confirm_location' as Step:
        if (text.toUpperCase() === 'YES') {
          this.form.location = this.locationStatus;
          this.bot(this.t('chatbot.register.locationLandmark')); this.step = 'location';
        } else {
          this.latitude = null; this.longitude = null; this.locationReady = false;
          this.bot(this.t('chatbot.register.locationManual')); this.step = 'location';
        }
        break;

      case 'location':
        this.form.location = (this.locationReady && this.form.location && text)
          ? `${this.form.location} (${text})` : text || this.form.location;
        this.step = 'confirm'; this.showConfirmSummary();
        break;

      case 'priority': {
        const p = text.toUpperCase();
        if (!['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'].includes(p)) {
          this.bot(this.t('chatbot.register.invalidPriority')); return;
        }
        this.form.priority = p; this.step = 'confirm'; this.showConfirmSummary();
        break;
      }

      case 'confirm':
        if (text.toUpperCase() === 'YES') { this.submitComplaint(); }
        else if (text.toUpperCase() === 'NO') { this.bot(this.t('chatbot.register.cancelled')); setTimeout(() => { this.showMenu(); }, 1500); }
        else { this.bot(this.t('chatbot.register.yesNo')); }
        break;
    }
  }

  confirmSuggestion(accepted: boolean): void {
    if (accepted) { this.suggestionConfirmed = true; this.detectLocation(); }
    else { this.bot(this.t('chatbot.register.editPriority')); this.step = 'priority'; }
  }

  private showConfirmSummary(): void {
    const locationLine = this.locationReady
      ? `${this.t('chatbot.register.summaryLocation')}: ${this.form.location} (${this.t('chatbot.register.summaryGps')})`
      : `${this.t('chatbot.register.summaryLocation')}: ${this.form.location}`;
    this.bot(
      `${this.t('chatbot.register.summary')}\n${this.t('chatbot.register.summaryDescription')}: ${this.form.description}\n` +
      `${locationLine}\n${this.t('chatbot.register.summaryDepartment')}: ${this.form.department}\n` +
      `${this.t('chatbot.register.summaryPriority')}: ${this.form.priority}\n\n${this.t('chatbot.register.confirm')}`
    );
  }

  private submitComplaint(): void {
    const payload = {
      title: this.form.title, description: this.form.description,
      location: this.form.location, department: this.form.department,
      priority: this.form.priority, latitude: this.latitude, longitude: this.longitude
    };
    if (this.offlineQueue.isOffline()) {
      this.offlineQueue.add(payload);
      this.bot(this.t('chatbot.register.savedOffline'));
      setTimeout(() => { this.showMenu(); }, 2500); return;
    }
    this.isLoading = true;
    this.http.post<{ id: number; department: string }>(
      `${this.BASE}/submit-complaint`, payload, { headers: this.headers }
    ).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.bot(`${this.t('chatbot.register.submitSuccess')} #${res.id} | ${res.department}`);
        setTimeout(() => { this.showMenu(); }, 2500);
      },
      error: () => {
        this.isLoading = false; this.offlineQueue.add(payload);
        this.bot(this.t('chatbot.register.savedFallback'));
        setTimeout(() => { this.showMenu(); }, 2500);
      }
    });
  }

  private handleTrack(text: string): void {
    const id = text.replace(/[^0-9]/g, '');
    if (!id) { this.bot(this.t('chatbot.track.invalidId')); return; }
    this.isLoading = true;
    this.http.get<{
      id: number; title: string; status: string; priority: string;
      department: string; assignedOfficer: string; escalated: boolean;
    }>(`${this.BASE}/status/${id}`, { headers: this.headers }).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.bot(this.t('chatbot.track.status'), { id: res.id, title: res.title, status: res.status, priority: res.priority, department: res.department, assignedOfficer: res.assignedOfficer, escalated: res.escalated });
        setTimeout(() => { this.bot(this.t('chatbot.track.another')); }, 500);
      },
      error: (err) => {
        this.isLoading = false;
        this.bot(err.status === 404 ? `${this.t('chatbot.track.notFound')} ${id}.` : this.t('chatbot.track.failed'));
      }
    });
  }

  private handleFaq(text: string): void {
    this.isLoading = true;
    this.http.get<{ answer: string }>(`${this.BASE}/faq?query=${encodeURIComponent(text)}`).subscribe({
      next: (res) => { this.isLoading = false; this.bot(res.answer); },
      error: () => { this.isLoading = false; this.bot(this.t('chatbot.faq.failed')); }
    });
  }

  // ── Voice ──────────────────────────────────────────────────────

  private initVoice(): void {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { return; }
    this.recognition = new SR();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event: any) => {
      let interim = '', final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) { final += t; } else { interim += t; }
      }
      this.liveTranscript = interim || final;
      if (final) {
        const confidence = event.results[event.results.length - 1][0].confidence ?? 1;
        if (confidence < 0.3) { this.bot(`🤔 ${final}`); this.isListening = false; return; }
        /* translateToEnglish is a no-op for pure English — safe to always call */
        this.input = this.translateToEnglish(final);
        this.isListening = false;
        this.send();
      }
    };

    this.recognition.onerror = (event: any) => {
      this.isListening = false; this.liveTranscript = '';
      const map: Record<string, string> = {
        'not-allowed':   this.t('chatbot.voice.permissionDenied'),
        'no-speech':     this.t('chatbot.voice.noSpeech'),
        'network':       this.t('chatbot.voice.network'),
        'aborted':       this.t('chatbot.voice.aborted'),
        'audio-capture': this.t('chatbot.voice.noMic')
      };
      this.bot(map[event.error] ?? this.t('chatbot.voice.failed'));
    };

    this.recognition.onend = () => { this.isListening = false; };
  }

  // ── Romanized Tamil → English keyword map ─────────────────────
  //
  // The Web Speech API with lang="ta-IN" returns ROMANIZED output
  // (e.g. "palli arige kulai kasavu"), NOT Unicode Tamil script.
  // Keys must match what the browser actually outputs, not Unicode chars.
  // Multiple spellings cover STT variance ("kasavu" vs "kasivu" etc.).
  // Sorted by key length descending so longer phrases ("kazhivu neer")
  // match before their substrings ("kazhivu").
  //
  private readonly TAMIL_KEYWORD_MAP: [string, string][] = [
    // Multi-word phrases first (longest match wins)
    ['kazhivu neer',  'sewage'],
    ['kazhivuneer',   'sewage'],
    ['theru vilakku', 'streetlight'],
    ['theruvilaakku', 'streetlight'],
    ['bus stand',     'bus stand'],
    ['bus station',   'bus stand'],
    ['power cut',     'power outage'],
    ['minvettu',      'power outage'],
    ['minvetdu',      'power outage'],
    // Water
    ['tanni',         'water'],
    ['neer',          'water'],
    ['nir',           'water'],
    ['kulai',         'pipe'],
    ['kuzhai',        'pipe'],
    ['kuzha',         'pipe'],
    ['kasavu',        'leakage'],
    ['kasivu',        'leakage'],
    ['kachaiv',       'leakage'],
    ['vellatam',      'flood'],
    ['vellam',        'flood'],
    ['vadikal',       'drain'],
    ['vadikaal',      'drain'],
    ['sevar',         'sewage'],
    // Electricity
    ['minsaram',      'electricity'],
    ['mincharama',    'electricity'],
    ['vilaakku',      'light'],
    ['vilakku',       'light'],
    ['vilakk',        'light'],
    ['kambi',         'wire'],
    // Road
    ['salai',         'road'],
    ['caaalai',       'road'],
    ['kuzhi',         'pothole'],
    ['kuzi',          'pothole'],
    ['nadaipatha',    'footpath'],
    ['nadaipaaathai', 'footpath'],
    ['udaindha',      'broken'],
    ['udainda',       'broken'],
    ['setham',        'damaged'],
    ['chetham',       'damaged'],
    // Sanitation
    ['kuppai',        'garbage'],
    ['kupai',         'garbage'],
    ['kazhivu',       'waste'],
    ['thuppuravu',    'sanitation'],
    ['thupuravu',     'sanitation'],
    ['azhukku',       'dirty'],
    ['azhukkk',       'dirty'],
    ['thurnaatram',   'smell'],
    ['durnaatram',    'smell'],
    ['naatram',       'smell'],
    // Sensitive locations
    ['palli',         'school'],
    ['maruthuvamana', 'hospital'],
    ['maruthuvamane', 'hospital'],
    ['kalloori',      'college'],
    ['kaluri',        'college'],
    ['santhai',       'market'],
    ['koil',          'temple'],
    ['kovil',         'temple'],
    // Urgency / descriptors
    ['avasaram',      'emergency'],
    ['urindha',       'urgent'],
    ['periya',        'large'],
    ['siriya',        'small'],
    ['aruge',         'near'],
    ['arige',         'near'],
    ['arikae',        'near'],
    ['paakkathu',     'near'],
  ];

  private translateToEnglish(text: string): string {
    let result = text.toLowerCase().trim();
    /* Already sorted longest-first in the array definition above */
    for (const [romanized, english] of this.TAMIL_KEYWORD_MAP) {
      result = result.replaceAll(romanized, english);
    }
    return result;
  }

  toggleVoice(): void {
    if (!this.recognition) { this.bot(this.t('chatbot.voice.unsupported')); return; }
    if (this.isListening) {
      this.recognition.stop(); this.isListening = false;
    } else {
      setTimeout(() => {
        this.recognition.lang = this.voiceLang;
        this.recognition.start();
        this.isListening = true; this.liveTranscript = '';
      }, 100);
    }
  }

  toggleVoiceLang(): void {
    this.voiceLang = this.voiceLang === 'en-IN' ? 'ta-IN' : 'en-IN';
    if (this.isListening) {
      this.recognition.stop();
      setTimeout(() => { this.recognition.lang = this.voiceLang; this.recognition.start(); }, 300);
    }
  }

  get voiceLangLabel(): string { return this.voiceLang === 'en-IN' ? 'EN' : 'தமிழ்'; }

  private watchNetworkStatus(): void {
    this.isOffline = !navigator.onLine;
    window.addEventListener('online',  () => { this.isOffline = false; this.syncPending(); });
    window.addEventListener('offline', () => { this.isOffline = true; });
  }

  private syncPending(): void {
    const count = this.offlineQueue.pendingCount;
    if (count === 0) { return; }
    this.bot(`${this.t('chatbot.sync.back')} ${count} ${this.t('chatbot.sync.pending')}`);
    this.offlineQueue.syncAll().then(result => {
      if (result.success > 0) { this.bot(`✅ ${result.success} ${this.t('chatbot.sync.success')}`); }
      if (result.failed  > 0) { this.bot(`⚠️ ${result.failed} ${this.t('chatbot.sync.failed')}`); }
    });
  }

  get pendingCount(): number { return this.offlineQueue.pendingCount; }

  back(): void { this.showMenu(); }
}