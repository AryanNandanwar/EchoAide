import { mergePatientDetails } from './patient-details.util';

describe('mergePatientDetails', () => {
  it('prefers receptionist card values when provided', () => {
    expect(
      mergePatientDetails(
        { name: 'Unknown' },
        { name: 'Asha Rao', age: '41', gender: 'Female', contact: '9876543210' },
      ),
    ).toEqual({
      name: 'Asha Rao',
      age: '41',
      gender: 'Female',
      contact: '9876543210',
    });
  });

  it('excludes note-extracted identity when receptionist details exist', () => {
    expect(
      mergePatientDetails(
        {
          Name: 'Supriya',
          Age: 'Not specified',
          Gender: 'Female',
          name: 'From conversation',
        },
        { name: 'Test Matter', gender: 'male', age: '22', contact: '1234567899' },
      ),
    ).toEqual({
      name: 'Test Matter',
      gender: 'male',
      age: '22',
      contact: '1234567899',
    });
  });

  it('uses note details when no receptionist details are provided', () => {
    expect(
      mergePatientDetails(
        { Name: 'Supriya', Age: '41', Gender: 'Female' },
        undefined,
      ),
    ).toEqual({
      name: 'Supriya',
      age: '41',
      gender: 'Female',
    });
  });
});
