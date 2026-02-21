import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Officer } from './officer';

describe('Officer', () => {
  let component: Officer;
  let fixture: ComponentFixture<Officer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Officer]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Officer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
