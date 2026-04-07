import {
  Component, signal, ElementRef, ViewChild, AfterViewChecked
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { OfflineQueueService } from '../../services/offline-queue.service';

type Mode = 'menu' | 'register' | 'track' | 'faq';
type RegisterStep = 'department' | 'title' | 'description' | 'confirm';
type TrackStep = 'list' | 'detail';

interface Message {
  from: 'bot' | 'user';
  text: string;
  card?: StatusCard;
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

interface ComplaintSummary {
  id: number;
  title: string;
  status: string;
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

  isOpen         = signal(false);
  messages       = signal<Message[]>([]);
  input          = '';
  mode: Mode     = 'menu';
  isLoading      = false;

  // ── Register flow ──────────────────────────────
  registerStep: RegisterStep = 'department';
  form = { department: '', title: '', description: '' };

  readonly departments = ['Water', 'Road', 'Electricity', 'Sanitation'];

  private readonly priorityMap: Record<string, string> = {
    'Water':       'HIGH',
    'Road':        'MEDIUM',
    'Electricity': 'HIGH',
    'Sanitation':  'MEDIUM'
  };

  // ── Track flow ─────────────────────────────────
  trackStep: TrackStep = 'list';
  activeComplaints: ComplaintSummary[] = [];

  // ── Voice ──────────────────────────────────────
  isListening    = false;
  liveTranscript = '';
  voiceLang      = 'en-IN';
  private recognition: any = null;

  // ── Offline ────────────────────────────────────
  isOffline  = false;
  syncMessage = '';

  private readonly BASE = 'http://localhost:8080/api/chatbot';

  constructor(
    private readonly http: HttpClient,
    private readonly offlineQueue: OfflineQueueService,
    private readonly translate: TranslateService
  ) {
    this.initVoice();
    this.watchNetworkStatus();
    this.translate.use(localStorage.getItem('lang') ?? 'en');
  }

  ngAfterViewChecked(): void { this.scrollToBottom(); }

  private scrollToBottom(): void {
    try {
      this.msgContainer.nativeElement.scrollTop =
        this.msgContainer.nativeElement.scrollHeight;
    } catch { }
  }

  private get headers(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`
    });
  }

  private push(msg: Message): void { this.messages.update(m => [...m, msg]); }
  private bot(text: string, card?: StatusCard): void { this.push({ from: 'bot', text, card }); }
  private user(text: string): void { this.push({ from: 'user', text }); }

  toggle(): void {
    this.isOpen.update(v => !v);
    if (this.isOpen() && this.messages().length === 0) { this.showMenu(); }
  }

  showMenu(): void {
    this.mode = 'menu';
    this.registerStep = 'department';
    this.trackStep = 'list';
    this.activeComplaints = [];
    this.syncMessage = '';
    this.form = { department: '', title: '', description: '' };
    this.bot('👋 Hi! I am CivicBot. What would you like to do?');
  }

  // ──────────────────────────────────────────────
  // FILE A COMPLAINT
  // ──────────────────────────────────────────────

  startRegister(): void {
    this.mode = 'register';
    this.registerStep = 'department';
    this.form = { department: '', title: '', description: '' };
    this.bot('📋 Please select the department for your complaint:');
  }

  selectDepartment(dept: string): void {
    this.form.department = dept;
    this.user(dept);
    this.bot('✏️ Enter a complaint title: (you can also use 🎤 voice)');
    this.registerStep = 'title';
  }

  // ──────────────────────────────────────────────
  // TRACK A COMPLAINT
  // ──────────────────────────────────────────────

  startTrack(): void {
    this.mode = 'track';
    this.trackStep = 'list';
    this.isLoading = true;
    this.bot('🔍 Fetching your active complaints...');

    this.http.get<ComplaintSummary[]>(
      `${this.BASE}/my-active-complaints`,
      { headers: this.headers }
    ).subscribe({
      next: (list) => {
        this.isLoading = false;
        if (list.length === 0) {
          this.bot('✅ You have no active complaints. All your complaints have been resolved!');
          setTimeout(() => this.showMenu(), 2000);
        } else {
          this.activeComplaints = list;
          this.bot(`You have ${list.length} active complaint(s). Please select one to track:`);
        }
      },
      error: (err) => {
        console.log('Track error:', err.status, err.error);
        this.isLoading = false;
        this.bot('❌ Could not fetch complaints. Please try again.');
        setTimeout(() => this.showMenu(), 2000);
      }
    });
  }

  selectComplaint(complaint: ComplaintSummary): void {
    this.user(complaint.title);
    this.trackStep = 'detail';
    this.isLoading = true;
    this.activeComplaints = [];

    this.http.get<any>(
      `${this.BASE}/status/${complaint.id}`,
      { headers: this.headers }
    ).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.bot('Here is your complaint status:', {
          id:              res.id,
          title:           res.title,
          status:          res.status,
          priority:        res.priority,
          department:      res.department,
          assignedOfficer: res.assignedOfficer,
          escalated:       res.escalated ?? false
        });
        setTimeout(() => this.showMenu(), 2000);
      },
      error: (err) => {
        console.log('Status error:', err.status, err.error);
        this.isLoading = false;
        this.bot('❌ Could not fetch complaint details. Please try again.');
        setTimeout(() => this.showMenu(), 2000);
      }
    });
  }

  // ──────────────────────────────────────────────
  // FAQ
  // ──────────────────────────────────────────────

  startFaq(): void {
    this.mode = 'faq';
    this.bot('❓ Ask me anything about our services! (e.g. "How long will my complaint take?")');
  }

  private handleFaq(text: string): void {
    this.isLoading = true;
    this.http.get<{ answer: string }>(
      `${this.BASE}/faq?query=${encodeURIComponent(text)}`
    ).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.bot(res.answer);
      },
      error: () => {
        this.isLoading = false;
        this.bot('❌ Could not find an answer. Please contact support or raise a complaint.');
      }
    });
  }

  // ──────────────────────────────────────────────
  // SEND (text input handler)
  // ──────────────────────────────────────────────

  send(): void {
    const text = this.input.trim();
    if (!text) { return; }
    this.input = '';
    this.liveTranscript = '';
    this.user(text);

    if      (this.mode === 'register') { this.handleRegister(text); }
    else if (this.mode === 'faq')      { this.handleFaq(text); }
  }

  private handleRegister(text: string): void {
    switch (this.registerStep) {

      case 'title':
        if (text.length < 5) {
          this.bot('⚠️ Please enter a more descriptive title (min 5 characters).');
          return;
        }
        this.form.title = text;
        this.bot('📝 Please describe your issue in detail: (you can also use 🎤 voice)');
        this.registerStep = 'description';
        break;

      case 'description':
        if (text.length < 10) {
          this.bot('⚠️ Please describe the issue in more detail (min 10 characters).');
          return;
        }
        this.form.description = text;
        this.registerStep = 'confirm';
        const priority = this.priorityMap[this.form.department] ?? 'LOW';
        this.bot(
          `📋 Complaint Summary:\n` +
          `• Department : ${this.form.department}\n` +
          `• Title      : ${this.form.title}\n` +
          `• Description: ${this.form.description}\n` +
          `• Priority   : ${priority}\n\n` +
          `Type YES to submit or NO to cancel.`
        );
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

  private submitComplaint(): void {
    this.isLoading = true;
    const priority = this.priorityMap[this.form.department] ?? 'LOW';

    const payload = {
      title:       this.form.title,
      description: this.form.description,
      department:  this.form.department,
      priority:    priority,
      location:    '',
      latitude:    null as number | null,
      longitude:   null as number | null
    };

    // ── PWA Offline support ──────────────────────
    if (this.offlineQueue.isOffline()) {
      this.offlineQueue.add(payload);
      this.isLoading = false;
      this.bot('📡 You are offline. Your complaint has been saved and will be submitted automatically when you are back online. ✅');
      setTimeout(() => this.showMenu(), 2500);
      return;
    }

    this.http.post<any>(
      `${this.BASE}/submit-complaint`, payload, { headers: this.headers }
    ).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.bot(`✅ Complaint submitted successfully! Status: ${res.status}`);
        setTimeout(() => this.showMenu(), 2000);
      },
      error: () => {
        // ── Fallback: save offline if submit fails ─
        this.offlineQueue.add(payload);
        this.isLoading = false;
        this.bot('⚠️ Could not submit right now. Your complaint has been saved offline and will be submitted automatically. ✅');
        setTimeout(() => this.showMenu(), 2500);
      }
    });
  }

  // ──────────────────────────────────────────────
  // VOICE RECOGNITION
  // ──────────────────────────────────────────────

  private initVoice(): void {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { return; }
    this.recognition = new SR();
    this.recognition.continuous      = false;
    this.recognition.interimResults  = true;
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
        if (confidence < 0.3) {
          this.bot('🤔 Could not understand clearly. Please try again.');
          this.isListening = false;
          return;
        }
        // ✅ Translate Tamil romanized → English before storing in DB
        this.input = this.translateToEnglish(final);
        this.isListening = false;
        this.send();
      }
    };

    this.recognition.onerror = (event: any) => {
      this.isListening    = false;
      this.liveTranscript = '';
      const map: Record<string, string> = {
        'not-allowed':   '❌ Microphone permission denied.',
        'no-speech':     '🤫 No speech detected. Please try again.',
        'network':       '🌐 Network error during voice recognition.',
        'aborted':       '⛔ Voice recognition stopped.',
        'audio-capture': '🎙️ No microphone found.'
      };
      this.bot(map[event.error] ?? '❌ Voice recognition failed.');
    };

    this.recognition.onend = () => { this.isListening = false; };
  }

  // ── Romanized Tamil → English keyword map ──────
  // Web Speech API with lang="ta-IN" returns ROMANIZED output
  // ✅ Translation happens BEFORE storing → DB always stores English
  private readonly TAMIL_KEYWORD_MAP: [string, string][] = [
    // Multi-word phrases first (longest match wins)
    ['kazhivu neer',  'sewage'],
    ['kazhivuneer',   'sewage'],
    ['theru vilakku', 'streetlight'],
    ['theruvilaakku', 'streetlight'],
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
    ['kambi',         'wire'],
    // Road
    ['salai',         'road'],
    ['kuzhi',         'pothole'],
    ['kuzi',          'pothole'],
    ['nadaipatha',    'footpath'],
    ['udaindha',      'broken'],
    ['udainda',       'broken'],
    ['setham',        'damaged'],
    ['chetham',       'damaged'],
    // Sanitation
    ['kuppai',        'garbage'],
    ['kupai',         'garbage'],
    ['kazhivu',       'waste'],
    ['thuppuravu',    'sanitation'],
    ['azhukku',       'dirty'],
    ['thurnaatram',   'smell'],
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
    ['paakkathu',     'near'],
  ];

  private translateToEnglish(text: string): string {
    let result = text.toLowerCase().trim();
    for (const [romanized, english] of this.TAMIL_KEYWORD_MAP) {
      result = result.replaceAll(romanized, english);
    }
    return result;
  }

  toggleVoice(): void {
    if (!this.recognition) {
      this.bot('❌ Voice recognition is not supported in this browser. Please use Chrome.');
      return;
    }
    if (this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    } else {
      setTimeout(() => {
        this.recognition.lang  = this.voiceLang;
        this.recognition.start();
        this.isListening    = true;
        this.liveTranscript = '';
      }, 100);
    }
  }

  toggleVoiceLang(): void {
    this.voiceLang = this.voiceLang === 'en-IN' ? 'ta-IN' : 'en-IN';
    if (this.isListening) {
      this.recognition.stop();
      setTimeout(() => {
        this.recognition.lang = this.voiceLang;
        this.recognition.start();
      }, 300);
    }
  }

  get voiceLangLabel(): string { return this.voiceLang === 'en-IN' ? 'EN' : 'தமிழ்'; }

  get pendingCount(): number { return this.offlineQueue.pendingCount; }

  // ──────────────────────────────────────────────
  // NETWORK STATUS + AUTO SYNC (PWA)
  // ──────────────────────────────────────────────

  private watchNetworkStatus(): void {
    this.isOffline = !navigator.onLine;
    window.addEventListener('online', () => {
      this.isOffline = false;
      this.syncPending();
    });
    window.addEventListener('offline', () => {
      this.isOffline = true;
    });
  }

  private syncPending(): void {
    const count = this.offlineQueue.pendingCount;
    if (count === 0) { return; }
    this.bot(`🌐 Back online! Syncing ${count} saved complaint(s)...`);
    this.offlineQueue.syncAll().then(result => {
      if (result.success > 0) {
        this.bot(`✅ ${result.success} complaint(s) submitted successfully!`);
      }
      if (result.failed > 0) {
        this.bot(`⚠️ ${result.failed} complaint(s) could not be submitted. Will retry later.`);
      }
    });
  }

  back(): void { this.showMenu(); }
}