import { IsEmail, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8, { message: "password must be at least 8 characters" })
  @MaxLength(72, { message: "password must be at most 72 characters" })
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: "password must contain at least one letter and one number",
  })
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  organizationName!: string;
}
