import { IsEmail, IsIn, IsNotEmpty, IsOptional } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  password!: string;

  @IsOptional()
  @IsIn(['doctor', 'receptionist'])
  accountType?: 'doctor' | 'receptionist';
}
