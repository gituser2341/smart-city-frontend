import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';

type Mode = 'menu' | 'register' | 'track' | 'faq';
type Step = 'category' | 'location' | 'description' | 'priority' | 'confirm';

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

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.css']
})
export class ChatbotComponent {

  isOpen   = signal(false);
  messages = signal<Message[]>([]);
  input    = '';
  mode: Mode = 'menu';
  isLoading = false;

  // Registration flow state
  step: Step = 'category';
  form = { category: '', location: '', description: '',
           priority: 'LOW', department: '', title: '' };

  private readonly BASE = 'http://localhost:8080/api/chatbot';

  constructor(private http: HttpClient) {}

  private get headers() {
    const token = localStorage.getItem('token') ?? '';
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  toggle() {
    this.isOpen.update(v => !v);
    if (this.isOpen() && this.messages().length === 0) {
      this.showMenu();
    }
  }

  private push(msg: Message) {
    this.messages.update(m => [...m, msg]);
  }

  private bot(text: string, card?: StatusCard) {
    this.push({ from: 'bot', text, card });
  }

  private user(text: string) {
    this.push({ from: 'user', text });
  }

  showMenu() {
    this.mode = 'menu';
    this.bot('👋 Hi! I am CivicBot. What would you like to do?');
  }

  selectMode(mode: Mode) {
    this.mode = mode;
    if (mode === 'register') {
      this.step = 'category';
      this.form = { category: '', location: '', description: '',
                    priority: 'LOW', department: '', title: '' };
      this.bot('📋 Let\'s file your complaint. What category is it? (e.g. water, road, electricity, garbage)');
    } else if (mode === 'track') {
      this.bot('🔍 Please enter your complaint ID (e.g. 101, 205)');
    } else if (mode === 'faq') {
      this.bot('❓ Ask me anything about our services!');
    }
  }

  send() {
    const text = this.input.trim();
    if (!text) return;
    this.input = '';
    this.user(text);

    if (this.mode === 'register') this.handleRegister(text);
    else if (this.mode === 'track') this.handleTrack(text);
    else if (this.mode === 'faq') this.handleFaq(text);
  }

  private handleRegister(text: string) {
    switch (this.step) {
      case 'category':
        this.form.category = text;
        this.form.title    = text + ' issue';
        this.isLoading     = true;
        this.http.get<any>(
          `${this.BASE}/suggest-department?text=${encodeURIComponent(text)}`
        ).subscribe({
          next: (res) => {
            this.form.department = res.department;
            this.isLoading = false;
            this.bot(`✅ Suggested department: ${res.department}. Now, where is the issue? (Enter location)`);
            this.step = 'location';
          },
          error: () => {
            this.isLoading = false;
            this.bot('Could not suggest department. Please enter location anyway.');
            this.step = 'location';
          }
        });
        break;

      case 'location':
        this.form.location = text;
        this.bot('📝 Describe the problem in detail:');
        this.step = 'description';
        break;

      case 'description':
        this.form.description = text;
        this.bot('⚠️ What is the priority? Type: LOW, MEDIUM, HIGH, or EMERGENCY');
        this.step = 'priority';
        break;

      case 'priority':
        const p = text.toUpperCase();
        if (!['LOW','MEDIUM','HIGH','EMERGENCY'].includes(p)) {
          this.bot('Please type one of: LOW, MEDIUM, HIGH, EMERGENCY');
          return;
        }
        this.form.priority = p;
        this.step = 'confirm';
        this.bot(
          `📋 Here's your complaint summary:\n` +
          `• Category: ${this.form.category}\n` +
          `• Location: ${this.form.location}\n` +
          `• Department: ${this.form.department}\n` +
          `• Priority: ${this.form.priority}\n\n` +
          `Type YES to submit or NO to cancel.`
        );
        break;

      case 'confirm':
        if (text.toUpperCase() === 'YES') {
          this.isLoading = true;
          this.http.post<any>(
            `${this.BASE}/submit-complaint`,
            {
              title:       this.form.title,
              description: this.form.description,
              location:    this.form.location,
              department:  this.form.department,
              priority:    this.form.priority
            },
            { headers: this.headers }
          ).subscribe({
            next: (res) => {
              this.isLoading = false;
              this.bot(`✅ Complaint #${res.id} filed successfully! Status: ${res.status}`);
              setTimeout(() => this.showMenu(), 2000);
            },
            error: () => {
              this.isLoading = false;
              this.bot('❌ Failed to submit. Please try again.');
            }
          });
        } else {
          this.bot('❌ Cancelled. Returning to menu...');
          setTimeout(() => this.showMenu(), 1500);
        }
        break;
    }
  }

  private handleTrack(text: string) {
    const id = text.replace(/[^0-9]/g, '');
    if (!id) { this.bot('Please enter a valid complaint ID number.'); return; }

    this.isLoading = true;
    this.http.get<any>(
      `${this.BASE}/status/${id}`,
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
          escalated:       res.escalated
        });
        setTimeout(() => this.showMenu(), 500);
      },
      error: (err) => {
        this.isLoading = false;
        this.bot(err.status === 404
          ? `❌ No complaint found with ID ${id}.`
          : '❌ Could not fetch status. Please try again.');
      }
    });
  }

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

  back() { this.showMenu(); }
}