import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateReceptionistDto {
  @IsString()
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  doctorId!: string;
}
