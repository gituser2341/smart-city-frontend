import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DepartmentHeadComponent } from './department-head.component';

describe('DepartmentHeadComponent', () => {
  let component: DepartmentHeadComponent;
  let fixture: ComponentFixture<DepartmentHeadComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DepartmentHeadComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DepartmentHeadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
