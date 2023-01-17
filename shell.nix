{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = [
    pkgs.nodejs
    pkgs.postgresql

    # keep this line if you use bash
    pkgs.bashInteractive
  ];
}
