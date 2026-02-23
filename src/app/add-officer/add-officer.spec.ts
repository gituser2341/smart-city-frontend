import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddOfficerComponent } from './add-officer';

describe('AddOfficerComponent', () => {
  let component: AddOfficerComponent;
  let fixture: ComponentFixture<AddOfficerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddOfficerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddOfficerComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
