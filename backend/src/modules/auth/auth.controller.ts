import { Body, Controller, ForbiddenException, Post, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { CreateReceptionistDto } from './dto/create-receptionist.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('signup/receptionist')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async signupReceptionist(@Body() dto: CreateReceptionistDto) {
    return this.authService.signupReceptionist(dto);
  }

  @Post('login')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async login(@Body() dto: LoginDto) {
    try {
      const result = await this.authService.login(dto.email, dto.password, dto.accountType);
      return result;
    } catch (error) {
      const err: any = error;
      console.error('[auth/login] 500 error:', err?.name, err?.message, err?.stack);
      throw error;
    }
  }

  @Post('logout')
  async logout() {
    return this.authService.logout();
  }

  @Post('receptionists')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async createReceptionist(@Req() req: any, @Body() dto: CreateReceptionistDto) {
    if (req.user.role !== 'doctor') {
      throw new ForbiddenException('Only doctors can create receptionist accounts');
    }

    return this.authService.createReceptionist(req.user.id, dto);
  }
}
