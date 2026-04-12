import {
  Component, signal, ElementRef, ViewChild, AfterViewChecked, Input, OnChanges, SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { OfflineQueueService } from '../../services/offline-queue.service';

// ── "location" is the new step inserted between description and confirm ──
type Mode = 'menu' | 'register' | 'track' | 'faq';
type RegisterStep = 'description' | 'location' | 'confirm';
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
export class ChatbotComponent implements AfterViewChecked, OnChanges {
  @Input() lang: string = 'en';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lang']) {
      const newLang = changes['lang'].currentValue as string;

      // Sync localStorage so currentLang getter stays consistent
      localStorage.setItem('lang', newLang);
      this.translate.use(newLang);

      // Sync voice language
      this.voiceLang = newLang === 'ta' ? 'ta-IN' : 'en-IN';

      // If currently listening, restart recognition with the new lang
      if (this.isListening && this.recognition) {
        this.recognition.stop();
        setTimeout(() => {
          this.recognition.lang = this.voiceLang;
          this.recognition.start();
        }, 300);
      } else if (this.recognition) {
        this.recognition.lang = this.voiceLang;
      }
    }
  }

  @ViewChild('msgContainer') private msgContainer!: ElementRef;

  isOpen = signal(false);
  messages = signal<Message[]>([]);
  input = '';
  mode: Mode = 'menu';
  registerStep: RegisterStep = 'description';
  trackStep: TrackStep = 'list';
  isLoading = false;

  activeComplaints: ComplaintSummary[] = [];

  form = {
    title: '',
    description: '',
    department: '',
    priority: 'LOW',
    location: '',
    latitude: null as number | null,
    longitude: null as number | null
  };

  // Location state
  isDetectingLocation = false;   // true while GPS is resolving
  locationDetected = false;   // true once GPS succeeded

  // Voice
  isListening = false;
  liveTranscript = '';
  voiceLang = 'en-IN';
  private recognition: any = null;

  // Offline
  isOffline = false;
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

  get currentLang(): string { return localStorage.getItem('lang') ?? 'en'; }
  get pendingCount(): number { return this.offlineQueue.pendingCount; }
  get voiceLangLabel(): string { return this.voiceLang === 'en-IN' ? 'EN' : 'தமிழ்'; }

  private push(msg: Message): void { this.messages.update(m => [...m, msg]); }
  private bot(text: string, card?: StatusCard): void { this.push({ from: 'bot', text, card }); }
  private user(text: string): void { this.push({ from: 'user', text }); }

  // ── Open / Close ───────────────────────────────

  toggle(): void {
    this.isOpen.update(v => !v);
    if (this.isOpen() && this.messages().length === 0) { this.showMenu(); }
  }

  showMenu(): void {
    this.mode = 'menu';
    this.registerStep = 'description';
    this.trackStep = 'list';
    this.activeComplaints = [];
    this.syncMessage = '';
    this.isDetectingLocation = false;
    this.locationDetected = false;
    this.resetForm();
    this.bot(this.ta('👋 வணக்கம்! நான் சிவிக்போட். எவ்வாறு உதவ முடியும்?',
      '👋 Hi! I am CivicBot. What would you like to do?'));
  }

  back(): void { this.showMenu(); }

  private resetForm(): void {
    this.form = {
      title: '', description: '', department: '',
      priority: 'LOW', location: '', latitude: null, longitude: null
    };
  }

  // ── Bilingual helper ───────────────────────────

  private ta(tamil: string, english: string): string {
    return this.currentLang === 'ta' ? tamil : english;
  }

  // ── File a Complaint ───────────────────────────

  startRegister(): void {
    this.mode = 'register';
    this.registerStep = 'description';
    this.resetForm();
    this.bot(this.ta(
      '📋 உங்கள் பிரச்சனையை விவரிக்கவும்.\n🎤 பொத்தானை பயன்படுத்தி பேசலாம்.\n\nஎடுத்துக்காட்டு: "பள்ளி அருகே குழாய் கசிவு"',
      '📋 Describe your complaint.\nUse 🎤 to speak or type below.\n\nExample: "Water pipe leakage near school"'
    ));
  }

  send(): void {
    const text = this.input.trim();
    if (!text) { return; }
    this.input = '';
    this.liveTranscript = '';
    this.user(text);
    if (this.mode === 'register') { this.handleRegister(text); }
    else if (this.mode === 'faq') { this.handleFaq(text); }
  }

  quickReply(text: string): void {
    this.user(text);
    this.handleRegister(text);
  }

  private handleRegister(text: string): void {
    switch (this.registerStep) {

      // ── Step 1: description ──────────────────────
      case 'description':
        if (text.trim().length < 5) {
          this.bot(this.ta(
            '⚠️ இன்னும் விரிவாக விவரிக்கவும் (குறைந்தது 5 எழுத்துகள்).',
            '⚠️ Please describe in more detail (min 5 characters).'
          ));
          return;
        }
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

            // Move to location step next
            this.registerStep = 'location';
            this.startLocationDetection();
          },
          error: () => {
            this.isLoading = false;
            this.registerStep = 'description';
            this.bot(this.ta(
              '⚠️ தானாக கண்டறிய முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
              '⚠️ Could not auto-detect department. Please try again.'
            ));
          }
        });
        break;

      // ── Step 2: location (manual typed fallback) ─
      case 'location':
        // User typed a location name manually
        this.form.location = text;
        this.form.latitude = null;
        this.form.longitude = null;
        this.locationDetected = false;
        this.moveToConfirm();
        break;

      // ── Step 3: confirm ──────────────────────────
      case 'confirm':
        const cmd = text.toUpperCase().trim();
        if (cmd === 'YES') {
          this.submitComplaint();
        } else if (cmd === 'NO') {
          this.bot(this.ta('❌ ரத்து செய்யப்பட்டது.', '❌ Cancelled.'));
          setTimeout(() => this.showMenu(), 1500);
        } else if (cmd === 'RETAKE') {
          this.registerStep = 'description';
          this.resetForm();
          this.bot(this.ta(
            '🎤 மீண்டும் பேசுங்கள் அல்லது தட்டச்சு செய்யவும்:',
            '🎤 Please speak or type your complaint again:'
          ));
        } else {
          this.bot(this.ta(
            'கீழே உள்ள பொத்தான்களை பயன்படுத்தவும்.',
            'Please use the buttons below.'
          ));
        }
        break;
    }
  }

  // ── Location detection ─────────────────────────

  /**
   * Called right after department detection succeeds.
   * Tries GPS first; on failure or denial, asks user to type a location.
   */
  private startLocationDetection(): void {
    this.isDetectingLocation = true;
    this.bot(this.ta(
      '📍 உங்கள் இடத்தை கண்டறிகிறது... சற்று காத்திருங்கள்.',
      '📍 Detecting your location automatically...'
    ));

    if (!navigator.geolocation) {
      this.isDetectingLocation = false;
      this.askForManualLocation();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.isDetectingLocation = false;
        this.locationDetected = true;
        this.form.latitude = position.coords.latitude;
        this.form.longitude = position.coords.longitude;
        this.form.location =
          `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`;

        this.bot(this.ta(
          `✅ இடம் கண்டறியப்பட்டது: 📍 ${this.form.location}\n\nதொடர கீழே உள்ள பொத்தானை அழுத்தவும்.`,
          `✅ Location detected: 📍 ${this.form.location}\n\nUse the buttons below to continue.`
        ));
        this.registerStep = 'confirm';
        this.showConfirmSummary();
      },
      (_err) => {
        this.isDetectingLocation = false;
        this.locationDetected = false;
        this.askForManualLocation();
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  /** Prompt the user to type their location when GPS fails or is denied */
  private askForManualLocation(): void {
    this.registerStep = 'location';
    this.bot(this.ta(
      '⚠️ இடத்தை தானாக கண்டறிய முடியவில்லை.\n📝 உங்கள் இடத்தை தட்டச்சு செய்யவும்.\n\nஎடுத்துக்காட்டு: "பள்ளி அருகே" அல்லது "Anna Nagar, Chennai"',
      '⚠️ Could not detect location automatically.\n📝 Please type your location below.\n\nExample: "Near school" or "Anna Nagar, Chennai"'
    ));
  }

  /** Skip GPS and let user type their location */
  skipGpsAndType(): void {
    if (this.isDetectingLocation) { return; }   // still waiting, ignore
    this.locationDetected = false;
    this.form.latitude = null;
    this.form.longitude = null;
    this.askForManualLocation();
  }

  /** User explicitly accepts the GPS co-ordinates and moves to confirm */
  useDetectedLocation(): void {
    this.registerStep = 'confirm';
    this.showConfirmSummary();
  }

  /** Build and display the complaint summary card */
  private showConfirmSummary(): void {
    const locLine = this.form.latitude
      ? this.ta(
        `• இடம்         : 📍 ${this.form.location}`,
        `• Location    : 📍 ${this.form.location}`
      )
      : this.ta(
        `• இடம்         : ${this.form.location || '(இடம் இல்லை)'}`,
        `• Location    : ${this.form.location || '(no location)'}`
      );

    this.bot(this.ta(
      `📋 புகார் சுருக்கம்:\n` +
      `• விளக்கம்   : ${this.form.description}\n` +
      `• துறை       : ${this.form.department}\n` +
      `• முன்னுரிமை : ${this.form.priority}\n` +
      `${locLine}\n\n` +
      `கீழே உள்ள பொத்தான்களை பயன்படுத்தவும்.`,

      `📋 Complaint Summary:\n` +
      `• Description: ${this.form.description}\n` +
      `• Department : ${this.form.department}\n` +
      `• Priority   : ${this.form.priority}\n` +
      `${locLine}\n\n` +
      `Use the buttons below to confirm.`
    ));
  }

  /** Small helper so the location step's text input can also advance the flow */
  private moveToConfirm(): void {
    this.registerStep = 'confirm';
    this.showConfirmSummary();
  }

  // ── Submit ─────────────────────────────────────

  private submitComplaint(): void {
    this.isLoading = true;

    const payload = {
      title: this.form.title,
      description: this.form.description,
      department: this.form.department.toUpperCase(),
      priority: this.form.priority,
      location: this.form.location,
      latitude: this.form.latitude,
      longitude: this.form.longitude
    };

    if (this.offlineQueue.isOffline()) {
      this.offlineQueue.add(payload);
      this.isLoading = false;
      this.bot(this.ta(
        '📡 இணையம் இல்லை. புகார் சேமிக்கப்பட்டது. இணைப்பு கிடைக்கும்போது சமர்ப்பிக்கப்படும். ✅',
        '📡 You are offline. Complaint saved and will submit when online. ✅'
      ));
      setTimeout(() => this.showMenu(), 2500);
      return;
    }

    this.http.post<any>(
      `${this.BASE}/submit-complaint`, payload, { headers: this.headers }
    ).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.bot(this.ta(
          `✅ புகார் #${res.id} வெற்றிகரமாக பதிவு செய்யப்பட்டது! துறை: ${res.department}`,
          `✅ Complaint #${res.id} submitted! Dept: ${res.department} | Status: ${res.status}`
        ));
        setTimeout(() => this.showMenu(), 2000);
      },
      error: () => {
        this.offlineQueue.add(payload);
        this.isLoading = false;
        this.bot(this.ta(
          '⚠️ சமர்ப்பிக்க முடியவில்லை. உள்ளூரில் சேமிக்கப்பட்டது.',
          '⚠️ Could not submit. Saved offline, will retry.'
        ));
        setTimeout(() => this.showMenu(), 2500);
      }
    });
  }

  // ── Track a Complaint ──────────────────────────

  startTrack(): void {
    this.mode = 'track';
    this.trackStep = 'list';
    this.isLoading = true;
    this.bot(this.ta(
      '🔍 உங்கள் புகார்களை பெறுகிறது...',
      '🔍 Fetching your active complaints...'
    ));

    this.http.get<ComplaintSummary[]>(
      `${this.BASE}/my-active-complaints`,
      { headers: this.headers }
    ).subscribe({
      next: (list) => {
        this.isLoading = false;
        if (list.length === 0) {
          this.bot(this.ta(
            '✅ தீர்க்கப்படாத புகார்கள் எதுவும் இல்லை!',
            '✅ You have no active complaints. All resolved!'
          ));
          setTimeout(() => this.showMenu(), 2000);
        } else {
          this.activeComplaints = list;
          this.bot(this.ta(
            `உங்களுக்கு ${list.length} புகார்(கள்) உள்ளன. ஒன்றை தேர்ந்தெடுக்கவும்:`,
            `You have ${list.length} active complaint(s). Please select one:`
          ));
        }
      },
      error: () => {
        this.isLoading = false;
        this.bot(this.ta(
          '❌ புகார்களை பெற முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
          '❌ Could not fetch complaints. Please try again.'
        ));
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
        this.bot(this.ta(
          'உங்கள் புகார் நிலை இங்கே:',
          'Here is your complaint status:'
        ), {
          id: res.id,
          title: res.title,
          status: res.status,
          priority: res.priority,
          department: res.department,
          assignedOfficer: res.assignedOfficer,
          escalated: res.escalated ?? false
        });
        setTimeout(() => this.showMenu(), 2000);
      },
      error: () => {
        this.isLoading = false;
        this.bot(this.ta(
          '❌ விவரங்களை பெற முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
          '❌ Could not fetch complaint details. Please try again.'
        ));
        setTimeout(() => this.showMenu(), 2000);
      }
    });
  }

  // ── FAQ ────────────────────────────────────────

  startFaq(): void {
  this.mode = 'faq';
  this.bot(this.ta(
    '❓ எங்கள் சேவைகள் பற்றி கேளுங்கள்!\n\nஎடுத்துக்காட்டு: "புகார் எவ்வளவு நேரத்தில் தீர்க்கப்படும்?"',
    '❓ Ask me anything about our services!\n\nExample: "How long does it take to resolve a complaint?"'
  ));
}

private handleFaq(text: string): void {
  if (text.trim().length < 3) {
    this.bot(this.ta(
      '⚠️ கேள்வியை சரியாக கேளுங்கள்.',
      '⚠️ Please enter a valid question.'
    ));
    return;
  }

  this.isLoading = true;
  this.http.get<{ answer: string }>(
    `${this.BASE}/faq?query=${encodeURIComponent(text)}`,
    { headers: this.headers }   // ← ADD headers (was missing!)
  ).subscribe({
    next: (res) => {
      this.isLoading = false;
      const answer = res?.answer?.trim();
      if (answer) {
        this.bot(answer);
      } else {
        this.bot(this.ta(
          '🤔 இதற்கான பதில் இல்லை. புகார் பதிவு செய்யலாம்.',
          '🤔 No answer found for that. You can file a complaint instead.'
        ));
      }
      // Prompt for follow-up
      setTimeout(() => {
        this.bot(this.ta(
          '💬 வேறு கேள்வி இருந்தால் கேளுங்கள், அல்லது ← திரும்பு.',
          '💬 Ask another question, or press ← to go back.'
        ));
      }, 400);
    },
    error: (err) => {
      this.isLoading = false;
      if (err.status === 401) {
        this.bot(this.ta(
          '🔐 உள்நுழைவு தேவை.',
          '🔐 Please log in to use FAQ.'
        ));
      } else {
        this.bot(this.ta(
          '❌ பதில் கண்டறிய முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
          '❌ Could not find an answer. Please try again.'
        ));
      }
    }
  });
}

  // ── Voice ──────────────────────────────────────

  private initVoice(): void {
    const SR = (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
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
        if (final.trim().length < 3) {
          this.bot(this.ta(
            '🤫 பேச்சு கண்டறியப்படவில்லை. மீண்டும் முயற்சிக்கவும்.',
            '🤫 No speech detected. Please try again.'
          ));
          this.isListening = false;
          return;
        }
        // ta-IN voice → native Tamil Unicode direct from STT, store as-is
        // translateToEnglish is only for romanized Tamil typed manually
        const processedText = final;
        this.input = processedText;
        this.isListening = false;
        this.send();
      }
    };

    this.recognition.onerror = (event: any) => {
      this.isListening = false;
      this.liveTranscript = '';
      const map: Record<string, string> = {
        'not-allowed': '❌ Microphone permission denied.',
        'no-speech': '🤫 No speech detected. Please try again.',
        'network': '🌐 Network error during voice recognition.',
        'aborted': '⛔ Voice recognition stopped.',
        'audio-capture': '🎙️ No microphone found.'
      };
      this.bot(map[event.error] ?? '❌ Voice recognition failed.');
    };

    this.recognition.onend = () => { this.isListening = false; };
  }

  toggleVoice(): void {
    if (!this.recognition) {
      this.bot('❌ Voice not supported. Please use Chrome.');
      return;
    }
    if (this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    } else {
      setTimeout(() => {
        this.recognition.lang = this.voiceLang;
        this.recognition.start();
        this.isListening = true;
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

  // ── Tamil romanized → English ──────────────────

  private readonly TAMIL_KEYWORD_MAP: [string, string][] = [
    ['kazhivu neer', 'sewage'], ['kazhivuneer', 'sewage'],
    ['theru vilakku', 'streetlight'], ['theruvilaakku', 'streetlight'],
    ['power cut', 'power outage'], ['minvettu', 'power outage'],
    ['minvetdu', 'power outage'],
    ['tanni', 'water'], ['neer', 'water'], ['nir', 'water'],
    ['kulai', 'pipe'], ['kuzhai', 'pipe'], ['kuzha', 'pipe'],
    ['kasavu', 'leakage'], ['kasivu', 'leakage'],
    ['vellatam', 'flood'], ['vellam', 'flood'],
    ['vadikal', 'drain'], ['vadikaal', 'drain'], ['sevar', 'sewage'],
    ['minsaram', 'electricity'], ['mincharama', 'electricity'],
    ['vilaakku', 'light'], ['vilakku', 'light'], ['kambi', 'wire'],
    ['salai', 'road'], ['kuzhi', 'pothole'], ['kuzi', 'pothole'],
    ['nadaipatha', 'footpath'], ['udaindha', 'broken'], ['udainda', 'broken'],
    ['setham', 'damaged'], ['chetham', 'damaged'],
    ['kuppai', 'garbage'], ['kupai', 'garbage'],
    ['kazhivu', 'waste'], ['thuppuravu', 'sanitation'],
    ['azhukku', 'dirty'], ['thurnaatram', 'smell'], ['naatram', 'smell'],
    ['palli', 'school'], ['maruthuvamana', 'hospital'],
    ['maruthuvamane', 'hospital'],
    ['kalloori', 'college'], ['kaluri', 'college'],
    ['santhai', 'market'], ['koil', 'temple'], ['kovil', 'temple'],
    ['avasaram', 'emergency'], ['urindha', 'urgent'],
    ['periya', 'large'], ['siriya', 'small'],
    ['aruge', 'near'], ['arige', 'near'], ['paakkathu', 'near'],
  ];

  private translateToEnglish(text: string): string {
    let result = text.toLowerCase().trim();
    for (const [romanized, english] of this.TAMIL_KEYWORD_MAP) {
      result = result.replaceAll(romanized, english);
    }
    return result;
  }

  // ── Offline + Sync ─────────────────────────────

  private watchNetworkStatus(): void {
    this.isOffline = !navigator.onLine;
    window.addEventListener('online', () => { this.isOffline = false; this.syncPending(); });
    window.addEventListener('offline', () => { this.isOffline = true; });
  }

  private syncPending(): void {
    const count = this.offlineQueue.pendingCount;
    if (count === 0) { return; }
    this.bot(this.ta(
      `🌐 மீண்டும் ஆன்லைனில் உள்ளீர்கள்! ${count} புகார்(கள்) சமர்ப்பிக்கப்படுகின்றன...`,
      `🌐 Back online! Syncing ${count} saved complaint(s)...`
    ));
    this.offlineQueue.syncAll().then(r => {
      if (r.success > 0)
        this.bot(this.ta(`✅ ${r.success} புகார்(கள்) வெற்றிகரமாக சமர்ப்பிக்கப்பட்டன!`,
          `✅ ${r.success} complaint(s) submitted successfully!`));
      if (r.failed > 0)
        this.bot(this.ta(`⚠️ ${r.failed} புகார்(கள்) தோல்வியடைந்தன. மீண்டும் முயற்சிக்கும்.`,
          `⚠️ ${r.failed} complaint(s) failed. Will retry later.`));
    });
  }
}